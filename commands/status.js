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
            : interaction.member.permissions.has(BigInt(0x10)); // ManageChannels

        if (!isStaff) {
            return interaction.reply({ content: '❌ Staff only.', flags: 64 });
        }

        const category = interaction.options.getString('category');
        const status   = interaction.options.getString('status');

        const statuses      = getStatuses();
        statuses[category]  = status;
        saveStatuses(statuses);

        const LABELS = { livery: 'Livery Design', uniform: 'Uniform Design', graphic: 'Graphic Design', discord: 'Discord Setup' };
        const COLOR  = status === 'open' ? 0x57f287 : status === 'delayed' ? 0xfee75c : 0xed4245;
        const EMOJI  = status === 'open'
            ? (process.env.EMOJI_OPEN    || '🟢')
            : status === 'delayed'
            ? (process.env.EMOJI_DELAYED || '🟡')
            : (process.env.EMOJI_CLOSED  || '🔴');

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`${EMOJI} **${LABELS[category]}** status updated to **${status.charAt(0).toUpperCase() + status.slice(1)}**.\n\nRe-send the panel with \`/order panel\` for the change to appear.`)
                    .setColor(COLOR)
            ]
        });
    }
};
