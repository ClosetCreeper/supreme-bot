const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getSupabase } = require('../lib/supabaseClient');

// ─── Staff gate ───────────────────────────────────────────────────────────────
function isStaff(member) {
    const staffRole = process.env.STAFF_ROLE_ID;
    return staffRole
        ? member.roles.cache.has(staffRole)
        : member.permissions.has(PermissionFlagsBits.ManageChannels);
}

// ─── Data helpers ───────────────────────────────────────────────────────────────
async function getTeams() {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('quota_teams').select('role_id, quota');
    if (error) throw error;
    return data || [];
}

async function getCurrentWave() {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('quota_waves')
        .select('*')
        .is('ended_at', null)
        .order('number', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data;
}

async function getWaveByNumber(number) {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('quota_waves').select('*').eq('number', number).maybeSingle();
    if (error) throw error;
    return data;
}

// Highest-quota team role the member currently holds, or null if none.
function applicableTeam(member, teams) {
    let best = null;
    for (const team of teams) {
        if (member.roles.cache.has(team.role_id)) {
            if (!best || team.quota > best.quota) best = team;
        }
    }
    return best;
}

// ─── Called from index.js on every message ─────────────────────────────────────
async function trackMessage(message) {
    const teams = await getTeams();
    if (teams.length === 0) return;

    const team = applicableTeam(message.member, teams);
    if (!team) return;

    const wave = await getCurrentWave();
    if (!wave) return;

    const supabase = getSupabase();
    const { error } = await supabase.rpc('quota_track_message', {
        p_wave_id: wave.id,
        p_user_id: message.author.id,
        p_role_id: team.role_id,
        p_quota: team.quota,
    });
    if (error) throw error;
}

// ─── Embed builder ────────────────────────────────────────────────────────────
async function buildWaveEmbed(guild, waveNumber) {
    const supabase = getSupabase();
    const wave = await getWaveByNumber(waveNumber);
    const teams = await getTeams();

    const { data: trackedRows, error } = await supabase
        .from('quota_wave_members')
        .select('user_id, role_id, quota, count')
        .eq('wave_id', wave.id);
    if (error) throw error;
    const trackedMap = new Map((trackedRows || []).map(r => [r.user_id, r]));

    await guild.members.fetch().catch(() => {});
    const liveHolders = new Map(); // userId -> best applicable {roleId, quota}
    for (const team of teams) {
        const role = guild.roles.cache.get(team.role_id);
        if (!role) continue;
        for (const [memberId] of role.members) {
            const existing = liveHolders.get(memberId);
            if (!existing || team.quota > existing.quota) {
                liveHolders.set(memberId, { roleId: team.role_id, quota: team.quota });
            }
        }
    }

    const allIds = new Set([...liveHolders.keys(), ...trackedMap.keys()]);
    const rows = [...allIds]
        .map(id => {
            const tracked = trackedMap.get(id);
            const live    = liveHolders.get(id);
            return {
                id,
                count: tracked ? tracked.count : 0,
                quota: tracked ? tracked.quota : (live ? live.quota : null),
            };
        })
        .sort((a, b) => b.count - a.count);

    const embed = new EmbedBuilder()
        .setTitle(`📊 Quota — Wave ${wave.number}${wave.ended_at ? ' (Ended)' : ' (Active)'}`)
        .setColor(wave.ended_at ? 0x99aab5 : 0x1e90ff)
        .setTimestamp(new Date(wave.ended_at || wave.started_at));

    if (rows.length === 0) {
        embed.setDescription('No one with a configured team role yet.');
    } else {
        const lines = rows.map(r => {
            const status = r.quota ? (r.count >= r.quota ? ' ✅' : ' ❌') : '';
            return `<@${r.id}> — **${r.count}**${r.quota ? `/${r.quota}` : ''}${status}`;
        });
        const CHUNK = 20;
        for (let i = 0; i < lines.length; i += CHUNK) {
            embed.addFields({
                name: i === 0 ? 'Members' : '​',
                value: lines.slice(i, i + CHUNK).join('\n'),
            });
        }
    }

    return embed;
}

// ─── Subcommand handlers ───────────────────────────────────────────────────────
async function handleStartWave(interaction) {
    const supabase = getSupabase();
    const { data: existing, error } = await supabase.from('quota_waves').select('id').limit(1);
    if (error) throw error;

    if (existing && existing.length > 0) {
        return interaction.reply({
            content: '❌ A wave has already been started. Use `/quota endwave` to close the current one — the next wave starts automatically.',
            ephemeral: true,
        });
    }

    const { error: insertError } = await supabase.from('quota_waves').insert({ number: 1 });
    if (insertError) throw insertError;

    await interaction.reply({ content: '🚀 Wave 1 has started. Messages from members with a configured team role are now being tracked.' });
}

async function handleEndWave(interaction) {
    const current = await getCurrentWave();
    if (!current) {
        return interaction.reply({ content: '❌ There is no active wave to end. Run `/quota startwave` first.', ephemeral: true });
    }

    const supabase = getSupabase();
    const { error: endError } = await supabase
        .from('quota_waves')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', current.id);
    if (endError) throw endError;

    const finishedEmbed = await buildWaveEmbed(interaction.guild, current.number);

    const { data: next, error: nextError } = await supabase
        .from('quota_waves')
        .insert({ number: current.number + 1 })
        .select()
        .single();
    if (nextError) throw nextError;

    await interaction.reply({
        content: `🏁 Wave ${current.number} ended. Wave ${next.number} has started.`,
        embeds: [finishedEmbed],
    });
}

async function handleTeam(interaction) {
    const role  = interaction.options.getRole('role');
    const quota = interaction.options.getInteger('quota');

    const supabase = getSupabase();
    const { error } = await supabase
        .from('quota_teams')
        .upsert({ role_id: role.id, quota, updated_at: new Date().toISOString() });
    if (error) throw error;

    const current = await getCurrentWave();
    if (current) {
        const { error: updateError } = await supabase
            .from('quota_wave_members')
            .update({ quota })
            .eq('wave_id', current.id)
            .eq('role_id', role.id);
        if (updateError) throw updateError;
    }

    await interaction.reply({ content: `✅ ${role} quota set to **${quota}** messages.` });
}

async function handleWaveView(interaction) {
    const number = interaction.options.getInteger('number');

    let waveNumber = number;
    if (!waveNumber) {
        const current = await getCurrentWave();
        if (!current) {
            return interaction.reply({ content: '❌ No wave has been started yet. Run `/quota startwave` first.', ephemeral: true });
        }
        waveNumber = current.number;
    } else {
        const wave = await getWaveByNumber(waveNumber);
        if (!wave) {
            return interaction.reply({ content: `❌ Wave ${waveNumber} doesn't exist.`, ephemeral: true });
        }
    }

    const embed = await buildWaveEmbed(interaction.guild, waveNumber);
    await interaction.reply({ embeds: [embed] });
}

async function handleViewTeams(interaction) {
    const teams = await getTeams();
    if (teams.length === 0) {
        return interaction.reply({
            content: 'No team roles configured yet. Use `/quota team {role} {number}` to add one.',
            ephemeral: true,
        });
    }

    const sorted = [...teams].sort((a, b) => b.quota - a.quota);
    const embed = new EmbedBuilder()
        .setTitle('📋 Quota Teams')
        .setDescription(sorted.map(t => `<@&${t.role_id}> — **${t.quota}** messages`).join('\n'))
        .setColor(0x1e90ff);

    await interaction.reply({ embeds: [embed] });
}

// ─── Command definition ────────────────────────────────────────────────────────
module.exports = {
    trackMessage,

    data: new SlashCommandBuilder()
        .setName('quota')
        .setDescription('Message quota tracking')
        .setDefaultMemberPermissions(null)
        .addSubcommand(sub => sub
            .setName('startwave')
            .setDescription('Start wave 1 (only needed once, ever)')
        )
        .addSubcommand(sub => sub
            .setName('endwave')
            .setDescription('End the current wave and start the next one')
        )
        .addSubcommand(sub => sub
            .setName('team')
            .setDescription('Set the message quota for a team role')
            .addRoleOption(opt => opt
                .setName('role')
                .setDescription('Team role')
                .setRequired(true)
            )
            .addIntegerOption(opt => opt
                .setName('quota')
                .setDescription('Required message count')
                .setRequired(true)
                .setMinValue(1)
            )
        )
        .addSubcommand(sub => sub
            .setName('wave')
            .setDescription('View a quota wave (defaults to the current wave)')
            .addIntegerOption(opt => opt
                .setName('number')
                .setDescription('Wave number to view')
                .setMinValue(1)
            )
        )
        .addSubcommand(sub => sub
            .setName('view')
            .setDescription('List configured team roles and their quotas')
        ),

    async execute(interaction) {
        if (!isStaff(interaction.member)) {
            return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        try {
            if (sub === 'startwave') return await handleStartWave(interaction);
            if (sub === 'endwave')   return await handleEndWave(interaction);
            if (sub === 'team')      return await handleTeam(interaction);
            if (sub === 'wave')      return await handleWaveView(interaction);
            if (sub === 'view')      return await handleViewTeams(interaction);
        } catch (err) {
            console.error('Quota command failed:', err);
            const msg = { content: '❌ Something went wrong talking to the database.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(msg).catch(() => {});
            } else {
                await interaction.reply(msg).catch(() => {});
            }
        }
    },
};
