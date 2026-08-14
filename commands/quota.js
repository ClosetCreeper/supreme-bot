const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const QUOTA_FILE    = path.join(__dirname, '..', 'quota.json');
const QUOTA_ROLE_ID = process.env.QUOTA_ROLE_ID || '1537870535021826079';

// ─── Storage ────────────────────────────────────────────────────────────────
function getData() {
    try {
        if (fs.existsSync(QUOTA_FILE)) {
            const raw = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
            return { defaultQuota: raw.defaultQuota ?? null, waves: raw.waves ?? [] };
        }
    } catch {}
    return { defaultQuota: null, waves: [] };
}

function saveData(data) {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2));
}

function getCurrentWave(data) {
    const last = data.waves[data.waves.length - 1];
    return last && last.endedAt === null ? last : null;
}

function startNewWave(data) {
    const number = data.waves.length ? data.waves[data.waves.length - 1].number + 1 : 1;
    const wave = { number, quota: data.defaultQuota, startedAt: Date.now(), endedAt: null, users: {} };
    data.waves.push(wave);
    return wave;
}

// ─── Called from index.js on every message from a tracked member ────────────
function trackMessage(userId) {
    const data = getData();
    const wave = getCurrentWave(data) || startNewWave(data);
    wave.users[userId] = (wave.users[userId] || 0) + 1;
    saveData(data);
}

// ─── Staff gate ───────────────────────────────────────────────────────────────
function isStaff(member) {
    const staffRole = process.env.STAFF_ROLE_ID;
    return staffRole
        ? member.roles.cache.has(staffRole)
        : member.permissions.has(PermissionFlagsBits.ManageChannels);
}

// ─── Embed builder ────────────────────────────────────────────────────────────
async function buildWaveEmbed(guild, wave) {
    await guild.members.fetch().catch(() => {});
    const role = guild.roles.cache.get(QUOTA_ROLE_ID);
    const roleIds = role ? [...role.members.keys()] : [];

    // Show everyone currently holding the role, plus anyone tracked this wave who since lost it.
    const allIds = new Set([...roleIds, ...Object.keys(wave.users)]);

    const rows = [...allIds]
        .map(id => ({ id, count: wave.users[id] || 0 }))
        .sort((a, b) => b.count - a.count);

    const quotaLabel = wave.quota ? `${wave.quota} messages` : 'not set';
    const statusFor = count => (wave.quota ? (count >= wave.quota ? ' ✅' : ' ❌') : '');

    const embed = new EmbedBuilder()
        .setTitle(`📊 Quota — Wave ${wave.number}${wave.endedAt ? ' (Ended)' : ' (Active)'}`)
        .setDescription(`**Quota:** ${quotaLabel}`)
        .setColor(wave.endedAt ? 0x99aab5 : 0x1e90ff)
        .setTimestamp(wave.endedAt || wave.startedAt);

    if (rows.length === 0) {
        embed.addFields({ name: 'Members', value: 'No one with the tracked role yet.' });
    } else {
        const lines = rows.map(r =>
            `<@${r.id}> — **${r.count}**${wave.quota ? `/${wave.quota}` : ''}${statusFor(r.count)}`
        );
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
async function handleWaveView(interaction) {
    const data   = getData();
    const number = interaction.options.getInteger('number');

    let wave;
    if (number) {
        wave = data.waves.find(w => w.number === number);
        if (!wave) {
            return interaction.reply({ content: `❌ Wave ${number} doesn't exist.`, ephemeral: true });
        }
    } else {
        wave = getCurrentWave(data);
        if (!wave) {
            return interaction.reply({
                content: '❌ No active wave yet — one starts automatically once a tracked member sends a message.',
                ephemeral: true,
            });
        }
    }

    const embed = await buildWaveEmbed(interaction.guild, wave);
    await interaction.reply({ embeds: [embed] });
}

async function handleSet(interaction) {
    const amount = interaction.options.getInteger('amount');
    const data   = getData();

    data.defaultQuota = amount;
    const current = getCurrentWave(data);
    if (current) current.quota = amount;
    saveData(data);

    await interaction.reply({
        content: `✅ Quota set to **${amount}** messages. Applies to the current wave and will be the default for future waves.`,
    });
}

async function handleEndWave(interaction) {
    const data    = getData();
    const current = getCurrentWave(data);

    if (!current) {
        return interaction.reply({ content: '❌ There is no active wave to end.', ephemeral: true });
    }

    current.endedAt = Date.now();
    const finishedEmbed = await buildWaveEmbed(interaction.guild, current);

    const next = startNewWave(data);
    saveData(data);

    await interaction.reply({
        content: `🏁 Wave ${current.number} ended. Wave ${next.number} has started.`,
        embeds: [finishedEmbed],
    });
}

// ─── Command definition ────────────────────────────────────────────────────────
module.exports = {
    trackMessage,

    data: new SlashCommandBuilder()
        .setName('quota')
        .setDescription('Message quota tracking')
        .setDefaultMemberPermissions(null)
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
            .setName('set')
            .setDescription('Set the message quota (current wave + default for future waves)')
            .addIntegerOption(opt => opt
                .setName('amount')
                .setDescription('Required message count')
                .setRequired(true)
                .setMinValue(1)
            )
        )
        .addSubcommand(sub => sub
            .setName('endwave')
            .setDescription('End the current wave and start a new one')
        ),

    async execute(interaction) {
        if (!isStaff(interaction.member)) {
            return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        if (sub === 'wave')    return handleWaveView(interaction);
        if (sub === 'set')     return handleSet(interaction);
        if (sub === 'endwave') return handleEndWave(interaction);
    },
};
