const ENV = 'prod';

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ContainerBuilder,
    MediaGalleryBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags,
} = require('discord.js');

// ─── Configuration ────────────────────────────────────────────────────────────
const SUPPORT_CATEGORIES = {
    affiliate:  'Affiliate Support',
    management: 'Management Support',
    general:    'General Support',
};

const SUPPORT_PING_ROLES = {
    general:    '1509235380866519199',
    management: '1520978428524757032',
    affiliate:  '1520978428524757032',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getOrCreateCategory(guild, name) {
    let cat = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase()
    );
    if (!cat) cat = await guild.channels.create({ name, type: ChannelType.GuildCategory });
    return cat;
}

function isSupportTicket(channel) {
    return channel.topic && channel.topic.startsWith('SUPPORT_TICKET:');
}

function parseSupportMeta(channel) {
    if (!channel.topic) return null;
    const parts = channel.topic.split(':');
    if (parts[0] !== 'SUPPORT_TICKET' || parts.length < 3) return null;
    return { serviceKey: parts[1], openerId: parts[2] };
}

function isStaffMember(member) {
    const staffRole = process.env.STAFF_ROLE_ID;
    return staffRole
        ? member.roles.cache.has(staffRole)
        : member.permissions.has(PermissionFlagsBits.ManageChannels);
}

async function getClaimerMember(channel, guild) {
    const staffRoleId = process.env.STAFF_ROLE_ID;
    const everyoneId  = guild.roles.everyone.id;
    for (const [id, ow] of channel.permissionOverwrites.cache) {
        if (id === everyoneId || id === staffRoleId) continue;
        if (ow.allow.has(PermissionFlagsBits.SendMessages)) {
            return guild.members.fetch(id).catch(() => null);
        }
    }
    return null;
}

function claimButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('support_claim').setLabel('Claim').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('support_unclaim').setLabel('Unclaim').setStyle(ButtonStyle.Danger),
    );
}

// ─── /dashboard send ──────────────────────────────────────────────────────────
async function handleSend(interaction) {
    const channel    = interaction.options.getChannel('channel');
    const bannerUrl  = process.env.DASHBOARD_BANNER_URL;
    const footerUrl  = process.env.DASHBOARD_FOOTER_URL;
    const accentHex  = process.env.DASHBOARD_ACCENT_COLOR || '#1e90ff';
    const accentColor = parseInt(accentHex.replace('#', ''), 16);

    const container = new ContainerBuilder().setAccentColor(accentColor);

    if (bannerUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(item => item.setURL(bannerUrl))
        );
    }

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            'Welcome to Supreme. This server was founded on 2026-06-25. We Offer the most supreme quality of services from ERLC.'
        )
    );

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('dashboard_support')
            .setLabel('Contact Support')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setLabel('Career Application')
            .setStyle(ButtonStyle.Link)
            .setURL('https://atlascoursesv1.vercel.app/apply'),
    );

    container.addActionRowComponents(buttonRow);

    if (footerUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(item => item.setURL(footerUrl))
        );
    }

    await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });

    await interaction.reply({ content: `✅ Dashboard sent to ${channel}.`, ephemeral: true });
}

// ─── Button: Contact Support → dropdown ──────────────────────────────────────
async function handleSupportButton(interaction) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId('support_select')
        .setPlaceholder('Select support type...')
        .addOptions(
            Object.entries(SUPPORT_CATEGORIES).map(([value, label]) =>
                new StringSelectMenuOptionBuilder().setLabel(label).setValue(value)
            )
        );

    await interaction.reply({
        content: 'Please select the type of support you need:',
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true,
    });
}

// ─── Select menu: ask what they need help with ────────────────────────────────
async function handleSupportSelect(interaction) {
    const guild      = interaction.guild;
    const member     = interaction.member;
    const serviceKey = interaction.values[0];
    const label      = SUPPORT_CATEGORIES[serviceKey];

    const existing = guild.channels.cache.find(c =>
        c.topic && c.topic === `SUPPORT_TICKET:${serviceKey}:${member.id}`
    );
    if (existing) {
        return interaction.reply({ content: `❌ You already have an open **${label}** ticket: ${existing}`, ephemeral: true });
    }

    const modal = new ModalBuilder()
        .setCustomId(`support_modal_${serviceKey}`)
        .setTitle(label)
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('support_question')
                    .setLabel('What can we help you with?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000)
            )
        );

    await interaction.showModal(modal);
}

// ─── Modal submit: open support ticket ────────────────────────────────────────
async function handleSupportModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild      = interaction.guild;
    const member     = interaction.member;
    const serviceKey = interaction.customId.replace('support_modal_', '');
    const label      = SUPPORT_CATEGORIES[serviceKey];
    const staffRole  = process.env.STAFF_ROLE_ID;
    const answer     = interaction.fields.getTextInputValue('support_question');

    if (!label) {
        return interaction.editReply({ content: '❌ Unknown ticket type.' });
    }

    const existing = guild.channels.cache.find(c =>
        c.topic && c.topic === `SUPPORT_TICKET:${serviceKey}:${member.id}`
    );
    if (existing) {
        return interaction.editReply({ content: `❌ You already have an open **${label}** ticket: ${existing}` });
    }

    const category = await getOrCreateCategory(guild, label);

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
        name: `ticket-${safeName}`,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `SUPPORT_TICKET:${serviceKey}:${member.id}`,
        permissionOverwrites: overwrites,
    });

    const bannerUrl = process.env.DASHBOARD_BANNER_URL;
    const openEmbed = new EmbedBuilder()
        .setTitle(`🎫 ${label}`)
        .setDescription(
            `Hey ${member}, thanks for reaching out!\n\n` +
            `**Type:** ${label}\n` +
            `A staff member will be with you shortly.`
        )
        .setColor(0x1e90ff)
        .setTimestamp();
    if (bannerUrl) openEmbed.setImage(bannerUrl);

    const responseEmbed = new EmbedBuilder()
        .setTitle(label)
        .setDescription(
            `Here are the responses submitted with this ticket.\n\n` +
            `**What can we help you with?**\n${answer}`
        )
        .setColor(0x1e90ff);

    const pingRoleId = SUPPORT_PING_ROLES[serviceKey];
    const pingContent = pingRoleId ? `${member} | <@&${pingRoleId}>` : `${member}`;

    await ticketChannel.send({
        content: pingContent,
        embeds: [openEmbed, responseEmbed],
        components: [claimButtonRow()],
        allowedMentions: pingRoleId ? { roles: [pingRoleId], users: [member.id] } : undefined,
    });
    await interaction.editReply({ content: `✅ Your ticket has been opened: ${ticketChannel}` });
}

// ─── Claim/Unclaim button handler ─────────────────────────────────────────────
async function handleClaimButton(interaction) {
    const channel   = interaction.channel;
    const member    = interaction.member;
    const staffRole = process.env.STAFF_ROLE_ID;

    if (!isStaffMember(member)) {
        return interaction.reply({ content: '❌ Only staff can claim tickets.', ephemeral: true });
    }
    if (!isSupportTicket(channel)) {
        return interaction.reply({ content: '❌ This is not a support ticket channel.', ephemeral: true });
    }

    if (interaction.customId === 'support_claim') {
        if (staffRole) {
            await channel.permissionOverwrites.edit(staffRole, {
                ViewChannel: true, SendMessages: false, ReadMessageHistory: true,
            });
        }
        await channel.permissionOverwrites.edit(member.id, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true, AttachFiles: true,
        });

        await interaction.reply({
            embeds: [new EmbedBuilder().setDescription(`✅ **${member.displayName}** has claimed this ticket.`).setColor(0x57f287).setTimestamp()]
        });

    } else {
        if (staffRole) {
            await channel.permissionOverwrites.edit(staffRole, {
                ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true, AttachFiles: true,
            });
        }
        await channel.permissionOverwrites.delete(member.id).catch(() => {});

        await interaction.reply({
            embeds: [new EmbedBuilder().setDescription(`🔓 **${member.displayName}** unclaimed this ticket.`).setColor(0xfee75c).setTimestamp()]
        });
    }
}

// ─── /ticket close ────────────────────────────────────────────────────────────
async function handleClose(interaction) {
    const channel = interaction.channel;
    if (!isSupportTicket(channel)) return interaction.reply({ content: '❌ Support ticket channels only.', ephemeral: true });

    await interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🔒 Ticket Closed')
            .setDescription('This ticket has been closed.\n\nUse `/ticket delete` to remove this channel.')
            .setColor(0xed4245).setTimestamp().setFooter({ text: `Closed by ${interaction.user.tag}` })]
    });
}

// ─── /ticket rename ───────────────────────────────────────────────────────────
async function handleRename(interaction) {
    const channel = interaction.channel;
    if (!isSupportTicket(channel)) return interaction.reply({ content: '❌ Support ticket channels only.', ephemeral: true });

    const name = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);
    await channel.setName(`ticket-${name}`);

    await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`✅ Ticket renamed to **ticket-${name}**.`).setColor(0x5865f2)]
    });
}

// ─── /ticket claim ────────────────────────────────────────────────────────────
async function handleClaim(interaction) {
    const channel   = interaction.channel;
    const member    = interaction.member;
    const staffRole = process.env.STAFF_ROLE_ID;
    if (!isSupportTicket(channel)) return interaction.reply({ content: '❌ Support ticket channels only.', ephemeral: true });

    if (staffRole) {
        await channel.permissionOverwrites.edit(staffRole, {
            ViewChannel: true, SendMessages: false, ReadMessageHistory: true,
        });
    }
    await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true, AttachFiles: true,
    });

    await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`✅ **${member.displayName}** has claimed this ticket.`).setColor(0x57f287).setTimestamp()]
    });
}

// ─── /ticket unclaim ──────────────────────────────────────────────────────────
async function handleUnclaim(interaction) {
    const channel   = interaction.channel;
    const member    = interaction.member;
    const staffRole = process.env.STAFF_ROLE_ID;
    if (!isSupportTicket(channel)) return interaction.reply({ content: '❌ Support ticket channels only.', ephemeral: true });

    if (staffRole) {
        await channel.permissionOverwrites.edit(staffRole, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true, AttachFiles: true,
        });
    }
    await channel.permissionOverwrites.delete(member.id).catch(() => {});

    await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`🔓 **${member.displayName}** unclaimed this ticket.`).setColor(0xfee75c).setTimestamp()]
    });
}

// ─── /ticket add ──────────────────────────────────────────────────────────────
async function handleAdd(interaction) {
    const channel = interaction.channel;
    if (!isSupportTicket(channel)) return interaction.reply({ content: '❌ Support ticket channels only.', ephemeral: true });

    const target = interaction.options.getMember('user');
    await channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
    });

    await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`✅ **${target.displayName}** has been added to this ticket.`).setColor(0x57f287)]
    });
}

// ─── /ticket remove ───────────────────────────────────────────────────────────
async function handleRemove(interaction) {
    const channel = interaction.channel;
    if (!isSupportTicket(channel)) return interaction.reply({ content: '❌ Support ticket channels only.', ephemeral: true });

    const target = interaction.options.getMember('user');
    await channel.permissionOverwrites.edit(target.id, { ViewChannel: false });

    await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`✅ **${target.displayName}** has been removed from this ticket.`).setColor(0xed4245)]
    });
}

// ─── /ticket delete ───────────────────────────────────────────────────────────
async function handleDelete(interaction) {
    const channel = interaction.channel;
    if (!isSupportTicket(channel)) return interaction.reply({ content: '❌ Support ticket channels only.', ephemeral: true });

    await interaction.reply({ content: '🗑️ Deleting channel in 3 seconds...', ephemeral: true });
    setTimeout(() => channel.delete().catch(console.error), 3000);
}

// ─── Command definition ───────────────────────────────────────────────────────
module.exports = {
    ENV,

    handleSupportButton,
    handleSupportSelect,
    handleSupportModalSubmit,
    handleClaimButton,

    data: new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Dashboard management')
        .setDefaultMemberPermissions(null)
        .addSubcommand(sub => sub
            .setName('send')
            .setDescription('Send the dashboard to a channel')
            .addChannelOption(opt => opt.setName('channel').setDescription('Channel to send to').setRequired(true))
        ),

    async execute(interaction) {
        if (!isStaffMember(interaction.member)) {
            return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        if (sub === 'send') return handleSend(interaction);
    },
};

// ─── /ticket command ──────────────────────────────────────────────────────────
module.exports.ticketData = new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Support ticket management')
    .setDefaultMemberPermissions(null)
    .addSubcommand(sub => sub.setName('close').setDescription('Close this ticket'))
    .addSubcommand(sub => sub.setName('rename').setDescription('Rename this ticket').addStringOption(opt => opt.setName('name').setDescription('New name').setRequired(true)))
    .addSubcommand(sub => sub.setName('claim').setDescription('Claim this ticket'))
    .addSubcommand(sub => sub.setName('unclaim').setDescription('Unclaim this ticket'))
    .addSubcommand(sub => sub.setName('add').setDescription('Add a user to this ticket').addUserOption(opt => opt.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a user from this ticket').addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand(sub => sub.setName('delete').setDescription('Delete this ticket channel'));

module.exports.ticketExecute = async function(interaction) {
    const sub = interaction.options.getSubcommand();
    const isStaff = isStaffMember(interaction.member);
    if (!isStaff) return interaction.reply({ content: '❌ Staff only.', ephemeral: true });

    switch (sub) {
        case 'close':   return handleClose(interaction);
        case 'rename':  return handleRename(interaction);
        case 'claim':   return handleClaim(interaction);
        case 'unclaim': return handleUnclaim(interaction);
        case 'add':     return handleAdd(interaction);
        case 'remove':  return handleRemove(interaction);
        case 'delete':  return handleDelete(interaction);
    }
};
