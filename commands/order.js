const {
    SlashCommandBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');

// ─── Configuration ───────────────────────────────────────────────────────────
// Category names for each ticket type (created automatically if missing)
const SERVICE_CATEGORIES = {
    livery:   'Livery Design',
    uniform:  'Uniform Design',
    graphic:  'Graphic Design',
    discord:  'Discord Setup',
};

// Friendly label for each service type (used in embeds/channel names)
const SERVICE_LABELS = {
    livery:   'Livery Design',
    uniform:  'Uniform Design',
    graphic:  'Graphic Design',
    discord:  'Discord Setup',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Find or create a category by name in the guild */
async function getOrCreateCategory(guild, name) {
    let category = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase()
    );
    if (!category) {
        category = await guild.channels.create({
            name,
            type: ChannelType.GuildCategory,
        });
    }
    return category;
}

/** Check whether a channel is a registered order ticket */
function isTicketChannel(channel) {
    return channel.topic && channel.topic.startsWith('ORDER_TICKET:');
}

/** Parse ticket metadata from channel topic */
function parseTicketMeta(channel) {
    // Topic format: ORDER_TICKET:{serviceKey}:{openerId}
    if (!channel.topic) return null;
    const parts = channel.topic.split(':');
    if (parts[0] !== 'ORDER_TICKET' || parts.length < 3) return null;
    return { serviceKey: parts[1], openerId: parts[2] };
}

// ─── /order panel ────────────────────────────────────────────────────────────
async function handlePanel(interaction) {
    const channel = interaction.options.getChannel('channel');
    const OPEN   = process.env.EMOJI_OPEN    || '🟢';
    const CLOSED = process.env.EMOJI_CLOSED  || '🔴';
    const DELAY  = process.env.EMOJI_DELAYED || '🟡';

    const bannerUrl = process.env.BANNER_URL;

    const embed = new EmbedBuilder()
        .setTitle('Order Here')
        .setDescription(
            'Want to make a purchase? Here\'s the right place! Please check out our order status below before ordering. We thank you for ordering with us!\n\n' +
            `**Order Status:**\n` +
            `${CLOSED} **Livery Design** — Closed\n` +
            `${CLOSED} **Uniform Design** — Closed\n` +
            `${OPEN} **Graphic Design** — Open\n` +
            `${DELAY} **Discord Setup** — Delayed\n`
        )
        .setColor(0x1e90ff)
        .setFooter({ text: 'Select a service below to open a ticket.' });

    if (bannerUrl) embed.setImage(bannerUrl);

    const menu = new StringSelectMenuBuilder()
        .setCustomId('order_select')
        .setPlaceholder('Select a service to order...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Livery Design')
                .setDescription('Custom ER:LC livery design')
                .setValue('livery'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Uniform Design')
                .setDescription('Custom ER:LC uniform design')
                .setValue('uniform'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Graphic Design')
                .setDescription('Logos, banners, and assorted graphics')
                .setValue('graphic'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Discord Setup')
                .setDescription('Full Discord server setup and services')
                .setValue('discord'),
        );

    const row = new ActionRowBuilder().addComponents(menu);

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ Panel sent to ${channel}.`, ephemeral: true });
}

// ─── Select menu handler (called from index.js) ───────────────────────────────
async function handleOrderSelect(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const guild      = interaction.guild;
    const member     = interaction.member;
    const serviceKey = interaction.values[0];
    const label      = SERVICE_LABELS[serviceKey];
    const staffRole  = process.env.STAFF_ROLE_ID;

    // Check for existing open ticket by this user for this service
    const existing = guild.channels.cache.find(c =>
        c.topic && c.topic === `ORDER_TICKET:${serviceKey}:${member.id}`
    );
    if (existing) {
        return interaction.editReply({
            content: `❌ You already have an open **${label}** ticket: ${existing}`,
        });
    }

    // Get/create category
    const categoryName = SERVICE_CATEGORIES[serviceKey];
    const category = await getOrCreateCategory(guild, categoryName);

    // Sanitize username for channel name
    const safeName = (member.displayName || member.user.username)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20) || member.id;

    // Build permission overwrites
    const overwrites = [
        {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.ViewChannel],
        },
        {
            id: member.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
            ],
        },
    ];

    if (staffRole) {
        overwrites.push({
            id: staffRole,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles,
            ],
        });
    }

    const ticketChannel = await guild.channels.create({
        name: `order-${safeName}`,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `ORDER_TICKET:${serviceKey}:${member.id}`,
        permissionOverwrites: overwrites,
    });

    const openEmbed = new EmbedBuilder()
        .setTitle(`📋 ${label} Order`)
        .setDescription(
            `Hey ${member}, thanks for opening an order!\n\n` +
            `**Service:** ${label}\n` +
            `A staff member will be with you shortly. Please describe your order in detail.`
        )
        .setColor(0x57f287)
        .setTimestamp();

    const bannerUrl = process.env.BANNER_URL;
    if (bannerUrl) openEmbed.setImage(bannerUrl);

    await ticketChannel.send({ content: `${member}`, embeds: [openEmbed] });

    await interaction.editReply({
        content: `✅ Your ticket has been opened: ${ticketChannel}`,
    });
}

// ─── /order move ─────────────────────────────────────────────────────────────
async function handleMove(interaction) {
    const channel = interaction.channel;
    if (!isTicketChannel(channel)) {
        return interaction.reply({ content: '❌ This command can only be used in an order ticket channel.', ephemeral: true });
    }

    const targetKey  = interaction.options.getString('category');
    const targetName = SERVICE_CATEGORIES[targetKey];
    const guild      = interaction.guild;

    const category = await getOrCreateCategory(guild, targetName);

    // Update topic to reflect new service type
    const meta = parseTicketMeta(channel);
    const newTopic = `ORDER_TICKET:${targetKey}:${meta ? meta.openerId : 'unknown'}`;

    await channel.setParent(category.id, { lockPermissions: false });
    await channel.setTopic(newTopic);

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setDescription(`✅ Ticket moved to **${targetName}**.`)
                .setColor(0x5865f2)
        ]
    });
}

// ─── /order fix ──────────────────────────────────────────────────────────────
async function handleFix(interaction) {
    const channel = interaction.channel;

    // Re-register by setting a generic topic if it has none or lost its ticket tag
    const existing = parseTicketMeta(channel);
    if (existing) {
        return interaction.reply({ content: '⚠️ This channel is already registered as a ticket.', ephemeral: true });
    }

    // Prompt user for service key
    const menu = new StringSelectMenuBuilder()
        .setCustomId('fix_select_PLACEHOLDER') // We'll handle inline
        .setPlaceholder('Select the service type for this ticket...')
        .addOptions(
            Object.entries(SERVICE_LABELS).map(([key, label]) =>
                new StringSelectMenuOptionBuilder().setLabel(label).setValue(key)
            )
        );

    // Since we handle this inline, we store a one-time listener
    const row = new ActionRowBuilder().addComponents(menu);
    const reply = await interaction.reply({ content: 'Select the service type to re-register this channel as a ticket:', components: [row], ephemeral: true, fetchReply: true });

    const collector = reply.createMessageComponentCollector({ time: 30_000, max: 1 });
    collector.on('collect', async i => {
        const serviceKey = i.values[0];
        const meta = `ORDER_TICKET:${serviceKey}:unknown`;
        await channel.setTopic(meta);
        await i.update({ content: `✅ Channel re-registered as a **${SERVICE_LABELS[serviceKey]}** ticket.`, components: [] });
    });
    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({ content: '⏱️ Timed out.', components: [] }).catch(() => {});
        }
    });
}

// ─── /order close ────────────────────────────────────────────────────────────
async function handleClose(interaction) {
    const channel = interaction.channel;
    if (!isTicketChannel(channel)) {
        return interaction.reply({ content: '❌ This command can only be used in an order ticket channel.', ephemeral: true });
    }

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle('🔒 Order Closed')
                .setDescription('This order has been fulfilled. Thank you for your purchase!\n\nThis channel will remain open for reference. Use `/order delete` to remove it.')
                .setColor(0xed4245)
                .setTimestamp()
                .setFooter({ text: `Closed by ${interaction.user.tag}` })
        ]
    });
}

// ─── /order add ──────────────────────────────────────────────────────────────
async function handleAdd(interaction) {
    const channel = interaction.channel;
    if (!isTicketChannel(channel)) {
        return interaction.reply({ content: '❌ This command can only be used in an order ticket channel.', ephemeral: true });
    }

    const target = interaction.options.getMember('user');
    await channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
    });

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setDescription(`✅ **${target.displayName}** has been added to this ticket.`)
                .setColor(0x57f287)
        ]
    });
}

// ─── /order remove ───────────────────────────────────────────────────────────
async function handleRemove(interaction) {
    const channel = interaction.channel;
    if (!isTicketChannel(channel)) {
        return interaction.reply({ content: '❌ This command can only be used in an order ticket channel.', ephemeral: true });
    }

    const target = interaction.options.getMember('user');
    await channel.permissionOverwrites.edit(target.id, {
        ViewChannel: false,
    });

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setDescription(`✅ **${target.displayName}** has been removed from this ticket.`)
                .setColor(0xed4245)
        ]
    });
}

// ─── /order delete ───────────────────────────────────────────────────────────
async function handleDelete(interaction) {
    const channel = interaction.channel;
    if (!isTicketChannel(channel)) {
        return interaction.reply({ content: '❌ This command can only be used in an order ticket channel.', ephemeral: true });
    }

    await interaction.reply({ content: '🗑️ Deleting channel in 3 seconds...', ephemeral: true });
    setTimeout(() => channel.delete().catch(console.error), 3000);
}

// ─── Command definition ───────────────────────────────────────────────────────
const categoryChoices = Object.entries(SERVICE_CATEGORIES).map(([key, name]) => ({
    name,
    value: key,
}));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('order')
        .setDescription('Order ticket management')
        .setDefaultMemberPermissions(null) // Open to all; individual subcommands check staff where needed

        .addSubcommand(sub => sub
            .setName('panel')
            .setDescription('Send the order panel to a channel')
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('Channel to send the panel to')
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName('move')
            .setDescription('Move this ticket to a different category')
            .addStringOption(opt => opt
                .setName('category')
                .setDescription('The category to move the ticket to')
                .setRequired(true)
                .addChoices(...categoryChoices)
            )
        )
        .addSubcommand(sub => sub
            .setName('fix')
            .setDescription('Re-register this channel as a ticket after a bot restart')
        )
        .addSubcommand(sub => sub
            .setName('close')
            .setDescription('Mark this order as fulfilled/closed')
        )
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a user to this ticket channel')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to add')
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a user from this ticket channel')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to remove')
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName('delete')
            .setDescription('Delete this ticket channel')
        ),

    handleOrderSelect,

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        // Staff-only guard for management commands
        const staffRole  = process.env.STAFF_ROLE_ID;
        const isStaff    = staffRole ? interaction.member.roles.cache.has(staffRole) : interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
        const staffCmds  = ['panel', 'move', 'fix', 'close', 'add', 'remove', 'delete'];

        if (staffCmds.includes(sub) && !isStaff) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        switch (sub) {
            case 'panel':  return handlePanel(interaction);
            case 'move':   return handleMove(interaction);
            case 'fix':    return handleFix(interaction);
            case 'close':  return handleClose(interaction);
            case 'add':    return handleAdd(interaction);
            case 'remove': return handleRemove(interaction);
            case 'delete': return handleDelete(interaction);
        }
    }
};