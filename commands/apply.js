const {
    SlashCommandBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    LabelBuilder,
    TextInputBuilder,
    TextInputStyle,
    FileUploadBuilder,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');

// ─── Configuration ────────────────────────────────────────────────────────────
const APPLICATION_TYPES = {
    discord_designer:  'Discord Designer',
    bot_designer:      'Bot Designer',
    clothing_designer: 'Clothing Designer',
    livery_designer:   'Livery Designer',
    graphics_designer: 'Graphics Designer',
};

// ─── /apply panel ─────────────────────────────────────────────────────────────
async function handlePanel(interaction) {
    const channel   = interaction.options.getChannel('channel');
    const bannerUrl = process.env.APPLY_BANNER_URL || process.env.BANNER_URL;

    const embed = new EmbedBuilder()
        .setTitle('Apply Here')
        .setDescription(
            'Interested in joining our design team? Select the role you\'re applying for below and fill out the application.\n\n' +
            '**Open Applications:**\n' +
            Object.values(APPLICATION_TYPES).map(label => `• ${label}`).join('\n')
        )
        .setColor(0x9b59b6)
        .setFooter({ text: 'Select an application below to get started.' });

    if (bannerUrl) embed.setImage(bannerUrl);

    const menu = new StringSelectMenuBuilder()
        .setCustomId('apply_select')
        .setPlaceholder('Select an application...')
        .addOptions(
            Object.entries(APPLICATION_TYPES).map(([value, label]) =>
                new StringSelectMenuOptionBuilder().setLabel(label).setValue(value)
            )
        );

    const row = new ActionRowBuilder().addComponents(menu);

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ Application panel sent to ${channel}.`, ephemeral: true });
}

// ─── Select menu handler — opens the modal ────────────────────────────────────
async function handleApplySelect(interaction) {
    const applicationKey = interaction.values[0];
    const label = APPLICATION_TYPES[applicationKey];

    const modal = new ModalBuilder()
        .setCustomId(`apply_modal_${applicationKey}`)
        .setTitle(`${label} Application`.slice(0, 45));

    const whyLabel = new LabelBuilder()
        .setLabel('Why do you want to become a designer?')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('why')
                .setStyle(TextInputStyle.Paragraph)
                .setMinLength(20)
                .setMaxLength(1000)
                .setRequired(true)
        );

    const uniqueLabel = new LabelBuilder()
        .setLabel('What makes you unique compared to others?')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('unique')
                .setStyle(TextInputStyle.Paragraph)
                .setMinLength(10)
                .setMaxLength(1000)
                .setRequired(true)
        );

    const activityLabel = new LabelBuilder()
        .setLabel('How active will you be? (1-10)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('activity')
                .setStyle(TextInputStyle.Short)
                .setMinLength(1)
                .setMaxLength(2)
                .setPlaceholder('e.g. 8')
                .setRequired(true)
        );

    const portfolioFilesLabel = new LabelBuilder()
        .setLabel('Upload portfolio files')
        .setDescription('Up to 10 files (images, PDFs, videos)')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('portfolio_files')
                .setMinValues(0)
                .setMaxValues(10)
                .setRequired(false)
        );

    const portfolioLinksLabel = new LabelBuilder()
        .setLabel('Portfolio Links (optional)')
        .setDescription('If your work is on a website, share the link(s) here.')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('links')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(500)
                .setRequired(false)
        );

    modal.addLabelComponents(whyLabel, uniqueLabel, activityLabel, portfolioFilesLabel, portfolioLinksLabel);

    await interaction.showModal(modal);
}

// ─── Modal submit handler ──────────────────────────────────────────────────────
async function handleApplyModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild  = interaction.guild;
    const member = interaction.member;

    const applicationKey = interaction.customId.replace('apply_modal_', '');
    const label = APPLICATION_TYPES[applicationKey] || applicationKey;

    const why      = interaction.fields.getTextInputValue('why');
    const unique   = interaction.fields.getTextInputValue('unique');
    const activity = interaction.fields.getTextInputValue('activity');
    let links;
    try {
        links = interaction.fields.getTextInputValue('links');
    } catch {
        links = '';
    }

    // Resolve uploaded file attachments
    let fileUrls = [];
    try {
        const uploaded = interaction.fields.getUploadedFiles('portfolio_files', false);
        if (uploaded) fileUrls = [...uploaded.values()];
    } catch (err) {
        console.error('Error resolving portfolio files:', err);
    }

    const forumChannelId = process.env.APPLICATIONS_FORUM_CHANNEL_ID;
    if (!forumChannelId) {
        return interaction.editReply({ content: '❌ Applications forum channel is not configured. Contact an admin.' });
    }

    const forumChannel = await guild.channels.fetch(forumChannelId).catch(() => null);
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
        return interaction.editReply({ content: '❌ Applications forum channel is misconfigured. Contact an admin.' });
    }

    const embed = new EmbedBuilder()
        .setTitle(`📋 ${label} Application`)
        .setAuthor({ name: member.user.tag, iconURL: member.displayAvatarURL() })
        .addFields(
            { name: 'Why do you want to become a designer?', value: why.slice(0, 1024) },
            { name: 'What makes you unique?', value: unique.slice(0, 1024) },
            { name: 'Activity (1-10)', value: activity },
            { name: 'Portfolio Links', value: links?.trim() ? links.slice(0, 1024) : 'None provided' },
        )
        .setColor(0x9b59b6)
        .setFooter({ text: `Applicant ID: ${member.id}` })
        .setTimestamp();

    if (fileUrls.length) {
        embed.addFields({
            name: `Portfolio Files (${fileUrls.length})`,
            value: 'Attached below ⬇️',
        });
    }

    const approveRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`apply_approve_${applicationKey}_${member.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`apply_decline_${applicationKey}_${member.id}`).setLabel('Decline').setStyle(ButtonStyle.Danger),
    );

    const thread = await forumChannel.threads.create({
        name: `${member.user.username} — ${label}`.slice(0, 100),
        message: {
            embeds: [embed],
            components: [approveRow],
            files: fileUrls.map(f => ({ attachment: f.url, name: f.name })),
        },
    });

    await interaction.editReply({ content: `✅ Your application has been submitted! Staff will review it soon.\n${thread.url || ''}` });
}

// ─── Approve / Decline button handler ──────────────────────────────────────────
async function handleApplyButton(interaction) {
    const staffRole = process.env.STAFF_ROLE_ID;
    const isStaff = staffRole
        ? interaction.member.roles.cache.has(staffRole)
        : interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);

    if (!isStaff) {
        return interaction.reply({ content: '❌ Only staff can review applications.', ephemeral: true });
    }

    // customId format: apply_approve_{key}_{userId} / apply_decline_{key}_{userId}
    const parts        = interaction.customId.split('_');
    const action        = parts[1]; // approve | decline
    const applicantId   = parts[parts.length - 1];
    const applicationKey = parts.slice(2, -1).join('_');
    const label = APPLICATION_TYPES[applicationKey] || applicationKey;

    const guild     = interaction.guild;
    const applicant = await guild.members.fetch(applicantId).catch(() => null);

    if (!applicant) {
        return interaction.reply({ content: '❌ Could not find that applicant in the server.', ephemeral: true });
    }

    if (action === 'approve') {
        const claimRoleId = process.env.STAFF_ROLE_ID;
        if (claimRoleId) {
            await applicant.roles.add(claimRoleId).catch(err => console.error('Failed to add role:', err));
        }

        await applicant.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('✅ Application Approved')
                    .setDescription(`Congratulations! Your **${label}** application has been approved. Welcome to the team!`)
                    .setColor(0x57f287)
            ]
        }).catch(() => {});

        await interaction.reply({
            embeds: [new EmbedBuilder().setDescription(`✅ **${applicant.user.tag}**'s application was approved by ${interaction.user}.`).setColor(0x57f287)]
        });

    } else {
        await applicant.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('❌ Application Declined')
                    .setDescription(`Unfortunately your **${label}** application was not approved at this time. Feel free to reapply in the future.`)
                    .setColor(0xed4245)
            ]
        }).catch(() => {});

        await interaction.reply({
            embeds: [new EmbedBuilder().setDescription(`❌ **${applicant.user.tag}**'s application was declined by ${interaction.user}.`).setColor(0xed4245)]
        });
    }

    // Disable the buttons after a decision is made
    const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true),
        ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true),
    );
    await interaction.message.edit({ components: [disabledRow] }).catch(() => {});
}

// ─── Command definition ─────────────────────────────────────────────────────────
module.exports = {
    data: new SlashCommandBuilder()
        .setName('apply')
        .setDescription('Application panel management')
        .setDefaultMemberPermissions(null)
        .addSubcommand(sub => sub
            .setName('panel')
            .setDescription('Send the application panel to a channel')
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('Channel to send the panel to')
                .setRequired(true)
            )
        ),

    handleApplySelect,
    handleApplyModalSubmit,
    handleApplyButton,

    async execute(interaction) {
        const staffRole = process.env.STAFF_ROLE_ID;
        const isStaff = staffRole
            ? interaction.member.roles.cache.has(staffRole)
            : interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!isStaff) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();
        if (sub === 'panel') return handlePanel(interaction);
    }
};
