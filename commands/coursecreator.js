const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    LabelBuilder,
    TextInputBuilder,
    TextInputStyle,
    FileUploadBuilder,
    PermissionFlagsBits,
} = require('discord.js');

// ─── /coursecreator apply — opens the application modal ───────────────────────
async function handleApply(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('coursecreator_apply_modal')
        .setTitle('Course Creator Application');

    const specializeLabel = new LabelBuilder()
        .setLabel('What do you specialize in?')
        .setDescription('e.g. Bots, Liveries, Uniforms, Banners, Discord Setup, Websites')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('specialize')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(200)
                .setRequired(true)
        );

    const whyLabel = new LabelBuilder()
        .setLabel('Why do you want to make a course?')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('why')
                .setStyle(TextInputStyle.Paragraph)
                .setMinLength(20)
                .setMaxLength(1000)
                .setRequired(true)
        );

    const activityLabel = new LabelBuilder()
        .setLabel('How active would you be? (1-5)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('activity')
                .setStyle(TextInputStyle.Short)
                .setMinLength(1)
                .setMaxLength(1)
                .setPlaceholder('e.g. 4')
                .setRequired(true)
        );

    const filesLabel = new LabelBuilder()
        .setLabel('Do you have any files to upload?')
        .setDescription('Up to 5 files (images, PDFs, videos)')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('files')
                .setMinValues(0)
                .setMaxValues(5)
                .setRequired(false)
        );

    const linksCommentsLabel = new LabelBuilder()
        .setLabel('Past work links / other comments')
        .setDescription('Paste links to past work and add any other comments (optional)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('links_comments')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(1000)
                .setRequired(false)
        );

    modal.addLabelComponents(specializeLabel, whyLabel, activityLabel, filesLabel, linksCommentsLabel);

    await interaction.showModal(modal);
}

// ─── Modal submit handler ───────────────────────────────────────────────────────
async function handleApplyModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;

    const specialize    = interaction.fields.getTextInputValue('specialize');
    const why            = interaction.fields.getTextInputValue('why');
    const activity        = interaction.fields.getTextInputValue('activity');
    let linksComments;
    try {
        linksComments = interaction.fields.getTextInputValue('links_comments');
    } catch {
        linksComments = '';
    }

    let fileUrls = [];
    try {
        const uploaded = interaction.fields.getUploadedFiles('files', false);
        if (uploaded) fileUrls = [...uploaded.values()];
    } catch (err) {
        console.error('Error resolving course creator application files:', err);
    }

    const channelId = process.env.COURSE_CREATOR_APPLICATIONS_CHANNEL_ID;
    if (!channelId) {
        return interaction.editReply({ content: '❌ Course creator applications channel is not configured. Contact an admin.' });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        return interaction.editReply({ content: '❌ Course creator applications channel is misconfigured. Contact an admin.' });
    }

    const embed = new EmbedBuilder()
        .setTitle('📋 Course Creator Application')
        .setAuthor({ name: member.user.tag, iconURL: member.displayAvatarURL() })
        .addFields(
            { name: 'Specializes In', value: specialize.slice(0, 1024) },
            { name: 'Why do you want to make a course?', value: why.slice(0, 1024) },
            { name: 'Activity (1-5)', value: activity },
            { name: 'Past Work / Comments', value: linksComments?.trim() ? linksComments.slice(0, 1024) : 'None provided' },
        )
        .setColor(0x9b59b6)
        .setFooter({ text: `Applicant ID: ${member.id}` })
        .setTimestamp();

    if (fileUrls.length) {
        embed.addFields({
            name: `Files (${fileUrls.length})`,
            value: 'Attached below ⬇️',
        });
    }

    const approveRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`coursecreator_approve_${member.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`coursecreator_decline_${member.id}`).setLabel('Decline').setStyle(ButtonStyle.Danger),
    );

    await channel.send({
        embeds: [embed],
        components: [approveRow],
        files: fileUrls.map(f => ({ attachment: f.url, name: f.name })),
    });

    await interaction.editReply({ content: '✅ Your application has been submitted! Staff will review it soon.' });
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

    // customId format: coursecreator_approve_{userId} / coursecreator_decline_{userId}
    const action      = interaction.customId.startsWith('coursecreator_approve_') ? 'approve' : 'decline';
    const applicantId = interaction.customId.replace('coursecreator_approve_', '').replace('coursecreator_decline_', '');

    const guild     = interaction.guild;
    const applicant = await guild.members.fetch(applicantId).catch(() => null);

    if (!applicant) {
        return interaction.reply({ content: '❌ Could not find that applicant in the server.', ephemeral: true });
    }

    if (action === 'approve') {
        const courseCreatorRoleId = process.env.COURSE_CREATOR_ROLE_ID;
        if (courseCreatorRoleId) {
            await applicant.roles.add(courseCreatorRoleId).catch(err => console.error('Failed to add Course Creator role:', err));
        }

        await applicant.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('✅ Application Approved')
                    .setDescription('You have been accepted! Reach out to an admin for more information.')
                    .setColor(0x57f287)
            ]
        }).catch(() => {});

        await interaction.reply({
            embeds: [new EmbedBuilder().setDescription(`✅ **${applicant.user.tag}**'s Course Creator application was approved by ${interaction.user}.`).setColor(0x57f287)]
        });

    } else {
        await applicant.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('❌ Application Declined')
                    .setDescription('Sorry, your application for Course Creator has been declined.')
                    .setColor(0xed4245)
            ]
        }).catch(() => {});

        await interaction.reply({
            embeds: [new EmbedBuilder().setDescription(`❌ **${applicant.user.tag}**'s Course Creator application was declined by ${interaction.user}.`).setColor(0xed4245)]
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
        .setName('coursecreator')
        .setDescription('Course Creator application management')
        .addSubcommand(sub => sub
            .setName('apply')
            .setDescription('Apply to become a Course Creator')
        ),

    handleApplyModalSubmit,
    handleApplyButton,

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'apply') return handleApply(interaction);
    }
};
