const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const STATUS_FILE = path.join(__dirname, '..', 'statuses.json');

const DEFAULT_STATUSES = {
    livery:  'open',
    uniform: 'open',
    graphic: 'open',
    discord: 'open',
};

function getStatuses() {
    try {
        if (fs.existsSync(STATUS_FILE)) {
            return { ...DEFAULT_STATUSES, ...JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')) };
        }
    } catch {}
    return { ...DEFAULT_STATUSES };
}

function saveStatuses(statuses) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(statuses, null, 2));
}

module.exports = {
    getStatuses,

    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Update the status of a service on the order panel')
        .addStringOption(opt => opt
            .setName('category')
            .setDescription('Which service to update')
            .setRequired(true)
            .addChoices(
                { name: 'Livery Design',  value: 'livery'  },
                { name: 'Uniform Design', value: 'uniform' },
                { name: 'Graphic Design', value: 'graphic' },
                { name: 'Discord Setup',  value: 'discord' },
            )
        )
        .addStringOption(opt => opt
            .setName('status')
            .setDescription('New status')
            .setRequired(true)
            .addChoices(
                { name: 'Open',    value: 'open'    },
                { name: 'Delayed', value: 'delayed' },
                { name: 'Closed',  value: 'closed'  },
            )
        ),

    async execute(interaction) {
        const staffRole = process.env.STAFF_ROLE_ID;
        const isStaff   = staffRole
            ? interaction.member.roles.cache.has(staffRole)
            : interaction.member.permissions.has(BigInt(0x10));

        if (!isStaff) {
            return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
        }

        const category = interaction.options.getString('category');
        const status   = interaction.options.getString('status');

        const statuses     = getStatuses();
        statuses[category] = status;
        saveStatuses(statuses);

        const LABELS = { livery: 'Livery Design', uniform: 'Uniform Design', graphic: 'Graphic Design', discord: 'Discord Setup' };
        const COLOR  = status === 'open' ? 0x57f287 : status === 'delayed' ? 0xfee75c : 0xed4245;
        const EMOJI  = status === 'open'
            ? (process.env.EMOJI_OPEN    || '🟢')
            : status === 'delayed'
            ? (process.env.EMOJI_DELAYED || '🟡')
            : (process.env.EMOJI_CLOSED  || '🔴');

        // ─── Auto-edit the live panel message ────────────────────────────────
        let panelEdited = false;
        try {
            const { getPanelRef } = require('./order');
            const ref = getPanelRef();
            if (ref) {
                const panelChannel = await interaction.guild.channels.fetch(ref.channelId).catch(() => null);
                if (panelChannel) {
                    const panelMsg = await panelChannel.messages.fetch(ref.messageId).catch(() => null);
                    if (panelMsg) {
                        // Rebuild the embed with all current statuses
                        const OPEN    = process.env.EMOJI_OPEN    || '🟢';
                        const CLOSED  = process.env.EMOJI_CLOSED  || '🔴';
                        const DELAYED = process.env.EMOJI_DELAYED || '🟡';
                        const bannerUrl = process.env.BANNER_URL;

                        const emojiFor = (key) => {
                            const s = statuses[key] || 'open';
                            if (s === 'open')    return OPEN;
                            if (s === 'delayed') return DELAYED;
                            if (s === 'closed')  return CLOSED;
                            return OPEN;
                        };
                        const labelFor = (key) => {
                            const s = statuses[key] || 'open';
                            return s.charAt(0).toUpperCase() + s.slice(1);
                        };

                        const { EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = require('discord.js');

                        const updatedEmbed = new EmbedBuilder()
                            .setTitle('Order Here')
                            .setDescription(
                                'Want to make a purchase? Here\'s the right place! Please check out our order status below before ordering. We thank you for ordering with us!\n\n' +
                                `**Order Status:**\n` +
                                `${emojiFor('livery')} **Livery Design** — ${labelFor('livery')}\n` +
                                `${emojiFor('uniform')} **Uniform Design** — ${labelFor('uniform')}\n` +
                                `${emojiFor('graphic')} **Graphic Design** — ${labelFor('graphic')}\n` +
                                `${emojiFor('discord')} **Discord Setup** — ${labelFor('discord')}\n`
                            )
                            .setColor(0x1e90ff)
                            .setFooter({ text: 'Select a service below to open a ticket.' });

                        if (bannerUrl) updatedEmbed.setImage(bannerUrl);

                        const availableOptions = [
                            { key: 'livery',  label: 'Livery Design',  description: 'Custom ER:LC livery design' },
                            { key: 'uniform', label: 'Uniform Design',  description: 'Custom ER:LC uniform design' },
                            { key: 'graphic', label: 'Graphic Design',  description: 'Logos, banners, and assorted graphics' },
                            { key: 'discord', label: 'Discord Setup',   description: 'Full Discord server setup and services' },
                        ]
                        .filter(s => (statuses[s.key] || 'open') !== 'closed')
                        .map(s => new StringSelectMenuOptionBuilder()
                            .setLabel(s.label).setDescription(s.description).setValue(s.key)
                        );

                        if (availableOptions.length === 0) {
                            await panelMsg.edit({ embeds: [updatedEmbed], components: [] });
                        } else {
                            const menu = new StringSelectMenuBuilder()
                                .setCustomId('order_select')
                                .setPlaceholder('Select a service to order...')
                                .addOptions(availableOptions);
                            await panelMsg.edit({ embeds: [updatedEmbed], components: [new ActionRowBuilder().addComponents(menu)] });
                        }

                        panelEdited = true;
                    }
                }
            }
        } catch (err) {
            console.error('Failed to auto-edit panel:', err);
        }
        // ─────────────────────────────────────────────────────────────────────

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(
                        `${EMOJI} **${LABELS[category]}** status updated to **${status.charAt(0).toUpperCase() + status.slice(1)}**.` +
                        (panelEdited ? '\n\n✅ Panel updated automatically.' : '\n\n⚠️ Could not find the panel message to update — re-send it with `/order panel`.')
                    )
                    .setColor(COLOR)
            ]
        });
    }
};
