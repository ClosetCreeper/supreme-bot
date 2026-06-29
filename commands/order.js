const {
    SlashCommandBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');

// ─── Configuration ───────────────────────────────────────────────────────────
const SERVICE_CATEGORIES = {
    livery:   'Livery Design',
    uniform:  'Uniform Design',
    graphic:  'Graphic Design',
    discord:  'Discord Setup',
};

const SERVICE_LABELS = {
    livery:   'Livery Design',
    uniform:  'Uniform Design',
    graphic:  'Graphic Design',
    discord:  'Discord Setup',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getOrCreateCategory(guild, name) {
    let category = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase()
    );
    if (!category) {
        category = await guild.channels.create({ name, type: ChannelType.GuildCategory });
    }
    return category;
}

function isTicketChannel(channel) {
    return channel.topic && channel.topic.startsWith('ORDER_TICKET:');
}

function parseTicketMeta(channel) {
    if (!channel.topic) return null;
    const parts = channel.topic.split(':');
    if (parts[0] !== 'ORDER_TICKET' || parts.length < 3) return null;
    return { serviceKey: parts[1], openerId: parts[2] };
}

function isStaffMember(member) {
    const staffRole = process.env.STAFF_ROLE_ID;
    return staffRole
        ? member.roles.cache.has(staffRole)
        : member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/** Build the Claim / Unclaim button row */
function claimButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('order_claim')
            .setLabel('Claim')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('order_unclaim')
            .setLabel('Unclaim')
            .setStyle(ButtonStyle.Danger),
    );
}

// ─── Button handler (called from index.js) ───────────────────────────────────
async function handleClaimButton(interaction) {
    const channel  = interaction.channel;
    const member   = interaction.member;
    const staffRole = process.env.STAFF_ROLE_ID;

    if (!isStaffMember(member)) {
        return interaction.reply({ content: '❌ Only staff can claim orders.', ephemeral: true });
    }

    if (!isTicketChannel(channel)) {
        return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    }

    if (interaction.customId === 'order_claim') {
        // Lock other staff out of sending — they can still view
        if (staffRole) {
            await channel.permissionOverwrites.edit(staffRole, {
                ViewChannel: true,
                SendMessages: false,
                ReadMessageHistory: true,
            });
        }
        // Give the claimer full access
        await channel.permissionOverwrites.edit(member.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            ManageMessages: true,
            AttachFiles: true,
        });

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`✅ **${member.displayName}** has claimed this order.`)
                    .setColor(0x57f287)
                    .setTimestamp()
            ]
        });

    } else {
        // Unclaim — restore full staff send perms, remove claimer overwrite
        if (staffRole) {
            await channel.permissionOverwrites.edit(staffRole, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                ManageMessages: true,
                AttachFiles: true,
            });
        }
        // Remove individual claimer overwrite (falls back to staff role)
        await channel.permissionOverwrites.delete(member.id).catch(() => {});

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`🔓 **${member.displayName}** has unclaimed this order. It is open for any staff member.`)
                    .setColor(0xfee75c)
                    .setTimestamp()
            ]
        });
    }
}

// ─── /order panel ────────────────────────────────────────────────────────────
async function handlePanel(interaction) {
    const channel  = interaction.options.getChannel('channel');
    const OPEN     = process.env.EMOJI_OPEN    || '🟢';
    const CLOSED   = process.env.EMOJI_CLOSED  || '🔴';
    const DELAYED  = process.env.EMOJI_DELAYED || '🟡';
    const statuses = require('./status').getStatuses();
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

    const embed = new EmbedBuilder()
        .setTitle('Order Here')
        .setDescription(
            'Want to make a purchase? This is the right place! Please check out our order status below before ordering. Thank you for ordering with us!\n\n' +
            `**Order Status:**\n` +
            `${emojiFor('livery')} **Livery Design** — ${labelFor('livery')}\n` +
            `${emojiFor('uniform')} **Uniform Design** — ${labelFor('uniform')}\n` +
            `${emojiFor('graphic')} **Graphic Design** — ${labelFor('graphic')}\n` +
            `${emojiFor('discord')} **Discord Setup** — ${labelFor('discord')}\n`
        )
        .setColor(0x1e90ff)
        .setFooter({ text: 'Select a service below to open a ticket.' });

    if (bannerUrl) embed.setImage(bannerUrl);

    const menu = new StringSelectMenuBuilder()
        .setCustomId('order_select')
        .setPlaceholder('Select a service to order...')
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Livery Design').setDescription('Custom ER:LC livery design').setValue('livery'),
            new StringSelectMenuOptionBuilder().setLabel('Uniform Design').setDescription('Custom ER:LC uniform design').setValue('uniform'),
            new StringSelectMenuOptionBuilder().setLabel('Graphic Design').setDescription('Logos, banners, and assorted graphics').setValue('graphic'),
            new StringSelectMenuOptionBuilder().setLabel('Discord Setup').setDescription('Full Discord server setup and services').setValue('discord'),
        );

    const row = new ActionRowBuilder().addComponents(menu);

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ Panel sent to ${channel}.`, ephemeral: true });
}

// ─── Select menu handler (called from index.js) ───────────────────────────────
async function handleOrderSelect(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild      = interaction.guild;
    const member     = interaction.member;
    const serviceKey = interaction.values[0];
    const label      = SERVICE_LABELS[serviceKey];
    const staffRole  = process.env.STAFF_ROLE_ID;

    const existing = guild.channels.cache.find(c =>
        c.topic && c.topic === `ORDER_TICKET:${serviceKey}:${member.id}`
    );
    if (existing) {
        return interaction.editReply({ content: `❌ You already have an open **${label}** ticket: ${existing}` });
    }

    const categoryName = SERVICE_CATEGORIES[serviceKey];
    const category = await getOrCreateCategory(guild, categoryName);

    const safeName = (member.displayName || member.user.username)
        .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || member.id;

    const overwrites = [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: member.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
        },
    ];

    if (staffRole) {
        overwrites.push({
            id: staffRole,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles],
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

    await ticketChannel.send({ content: `${member}`, embeds: [openEmbed], components: [claimButtonRow()] });

    await interaction.editReply({ content: `✅ Your ticket has been opened: ${ticketChannel}` });
}

// ─── /order move ─────────────────────────────────────────────────────────────
async function handleMove(interaction) {
    const channel = interaction.channel;
    if (!isTicketChannel(channel)) return interaction.reply({ content: '❌ This command can only be used in a ticket channel.', ephemeral: true });

    const targetKey  = interaction.options.getString('category');
    const targetName = SERVICE_CATEGORIES[targetKey];
    const category   = await getOrCreateCategory(interaction.guild, targetName);
    const meta       = parseTicketMeta(channel);
    await channel.setParent(category.id, { lockPermissions: false });
    await channel.setTopic(`ORDER_TICKET:${targetKey}:${meta ? meta.openerId : 'unknown'}`);

    await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Ticket moved to **${targetName}**.`).setColor(0x5865f2)] });
}

// ─── /order fix ──────────────────────────────────────────────────────────────
async function handleFix(interaction) {
    const channel  = interaction.channel;
    const existing = parseTicketMeta(channel);
    if (existing) return interaction.reply({ content: '⚠️ Already registered as a ticket.', ephemeral: true });

    const menu = new StringSelectMenuBuilder()
        .setCustomId('fix_select')
        .setPlaceholder('Select the service type...')
        .addOptions(Object.entries(SERVICE_LABELS).map(([key, label]) =>
            new StringSelectMenuOptionBuilder().setLabel(label).setValue(key)
        ));

    const row   = new ActionRowBuilder().addComponents(menu);
    const reply = await interaction.reply({ content: 'Select the service type to re-register:', components: [row], ephemeral: true, fetchReply: true });

    const collector = reply.createMessageComponentCollector({ time: 30_000, max: 1 });
    collector.on('collect', async i => {
        await channel.setTopic(`ORDER_TICKET:${i.values[0]}:unknown`);
        await i.update({ content: `✅ Re-registered as **${SERVICE_LABELS[i.values[0]]}** ticket.`, components: [] });
    });
    collector.on('end', collected => {
        if (!collected.size) interaction.editReply({ content: '⏱️ Timed out.', components: [] }).catch(() => {});
    });
}

// ─── /order close ────────────────────────────────────────────────────────────
async function handleClose(interaction) {
    const channel = interaction.channel;
    if (!isTicketChannel(channel)) return interaction.reply({ content: '❌ Ticket channels only.', ephemeral: true });

    await interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🔒 Order Closed')
            .setDescription('This order has been fulfilled. Thank you for your purchase!\n\nUse `/order delete` to remove this channel.')
            .setColor(0xed4245).setTimestamp().setFooter({ text: `Closed by ${interaction.user.tag}` })]
    });
}

// ─── /order claim ────────────────────────────────────────────────────────────
async function handleClaim(interaction) {
    const channel   = interaction.channel;
    const member    = interaction.member;
    const staffRole = process.env.STAFF_ROLE_ID;
    if (!isTicketChannel(channel)) return interaction.reply({ content: '❌ Ticket channels only.', ephemeral: true });

    if (staffRole) {
        await channel.permissionOverwrites.edit(staffRole, {
            ViewChannel: true, SendMessages: false, ReadMessageHistory: true,
        });
    }
    await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true, AttachFiles: true,
    });

    await interaction.reply({
        embeds: [new EmbedBuilder()
            .setDescription(`✅ **${member.displayName}** has claimed this order.`)
            .setColor(0x57f287).setTimestamp()]
    });
}

// ─── /order unclaim ──────────────────────────────────────────────────────────
async function handleUnclaim(interaction) {
    const channel   = interaction.channel;
    const member    = interaction.member;
    const staffRole = process.env.STAFF_ROLE_ID;
    if (!isTicketChannel(channel)) return interaction.reply({ content: '❌ Ticket channels only.', ephemeral: true });

    if (staffRole) {
        await channel.permissionOverwrites.edit(staffRole, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true, AttachFiles: true,
        });
    }
    await channel.permissionOverwrites.delete(member.id).catch(() => {});

    await interaction.reply({
        embeds: [new EmbedBuilder()
            .setDescription(`🔓 **${member.displayName}** unclaimed this order. Open for any staff member.`)
            .setColor(0xfee75c).setTimestamp()]
    });
}

// ─── /order add ──────────────────────────────────────────────────────────────
async function handleAdd(interaction) {
    const channel = interaction.channel;
    if (!isTicketChannel(channel)) return interaction.reply({ content: '❌ Ticket channels only.', ephemeral: true });

    const target = interaction.options.getMember('user');
    await channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
    });

    await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`✅ **${target.displayName}** has been added.`).setColor(0x57f287)]
    });
}

// ─── /order remove ───────────────────────────────────────────────────────────
async function handleRemove(interaction) {
    const channel = interaction.channel;
    if (!isTicketChannel(channel)) return interaction.reply({ content: '❌ Ticket channels only.', ephemeral: true });

    const target = interaction.options.getMember('user');
    await channel.permissionOverwrites.edit(target.id, { ViewChannel: false });

    await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`✅ **${target.displayName}** has been removed.`).setColor(0xed4245)]
    });
}

// ─── /order delete ───────────────────────────────────────────────────────────
async function handleDelete(interaction) {
    const channel = interaction.channel;
    if (!isTicketChannel(channel)) return interaction.reply({ content: '❌ Ticket channels only.', ephemeral: true });

    await interaction.reply({ content: '🗑️ Deleting channel in 3 seconds...', ephemeral: true });
    setTimeout(() => channel.delete().catch(console.error), 3000);
}

// ─── Command definition ───────────────────────────────────────────────────────
const categoryChoices = Object.entries(SERVICE_CATEGORIES).map(([key, name]) => ({ name, value: key }));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('order')
        .setDescription('Order ticket management')
        .setDefaultMemberPermissions(null)

        .addSubcommand(sub => sub.setName('panel').setDescription('Send the order panel to a channel')
            .addChannelOption(opt => opt.setName('channel').setDescription('Channel to send the panel to').setRequired(true)))
        .addSubcommand(sub => sub.setName('move').setDescription('Move this ticket to a different category')
            .addStringOption(opt => opt.setName('category').setDescription('Target category').setRequired(true).addChoices(...categoryChoices)))
        .addSubcommand(sub => sub.setName('fix').setDescription('Re-register this channel as a ticket'))
        .addSubcommand(sub => sub.setName('close').setDescription('Mark this order as fulfilled/closed'))
        .addSubcommand(sub => sub.setName('claim').setDescription('Claim this order ticket'))
        .addSubcommand(sub => sub.setName('unclaim').setDescription('Unclaim this order ticket'))
        .addSubcommand(sub => sub.setName('add').setDescription('Add a user to this ticket')
            .addUserOption(opt => opt.setName('user').setDescription('User to add').setRequired(true)))
        .addSubcommand(sub => sub.setName('remove').setDescription('Remove a user from this ticket')
            .addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true)))
        .addSubcommand(sub => sub.setName('delete').setDescription('Delete this ticket channel')),

    handleOrderSelect,
    handleClaimButton,

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        const isStaff   = isStaffMember(interaction.member);
        const staffCmds = ['panel', 'move', 'fix', 'close', 'claim', 'unclaim', 'add', 'remove', 'delete'];

        if (staffCmds.includes(sub) && !isStaff) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        switch (sub) {
            case 'panel':   return handlePanel(interaction);
            case 'move':    return handleMove(interaction);
            case 'fix':     return handleFix(interaction);
            case 'close':   return handleClose(interaction);
            case 'claim':   return handleClaim(interaction);
            case 'unclaim': return handleUnclaim(interaction);
            case 'add':     return handleAdd(interaction);
            case 'remove':  return handleRemove(interaction);
            case 'delete':  return handleDelete(interaction);
        }
    }
};
