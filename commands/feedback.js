const {
    SlashCommandBuilder,
    ContainerBuilder,
    MediaGalleryBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');

function renderStars(rating) {
    let result = '';
    for (let i = 0; i < 5; i++) {
        result += i < rating ? '⭐' : '☆';
    }
    return result;
}

const STAR_CHOICES = [
    { name: '⭐',         value: 1 },
    { name: '⭐⭐',       value: 2 },
    { name: '⭐⭐⭐',     value: 3 },
    { name: '⭐⭐⭐⭐',   value: 4 },
    { name: '⭐⭐⭐⭐⭐', value: 5 },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('feedback')
        .setDescription('Leave feedback for a designer')
        .addUserOption(opt => opt
            .setName('user')
            .setDescription('The designer you are rating')
            .setRequired(true)
        )
        .addIntegerOption(opt => opt
            .setName('stars')
            .setDescription('Rating from 1 to 5')
            .setRequired(true)
            .addChoices(...STAR_CHOICES)
        )
        .addStringOption(opt => opt
            .setName('feedback')
            .setDescription('Optional written feedback')
            .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser   = interaction.options.getUser('user');
        const stars        = interaction.options.getInteger('stars');
        const feedbackText = interaction.options.getString('feedback');

        const bannerUrl       = process.env.FEEDBACK_BANNER_URL;
        const footerImageUrl  = process.env.FEEDBACK_FOOTER_URL;
        const accentColorHex  = process.env.FEEDBACK_ACCENT_COLOR || '#1e90ff';
        const accentColor     = parseInt(accentColorHex.replace('#', ''), 16);

        const container = new ContainerBuilder().setAccentColor(accentColor);

        if (bannerUrl) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(item => item.setURL(bannerUrl))
            );
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('### Staff Review!')
        );

        container.addSeparatorComponents(new SeparatorBuilder());

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Customer::** ${interaction.user}\n` +
                `**Designer:** ${targetUser}\n` +
                `**Rating:** ${renderStars(stars)}\n` +
                `**Feedback:** ${feedbackText || 'No written feedback'}`
            )
        );

        if (footerImageUrl) {
            container.addSeparatorComponents(new SeparatorBuilder());
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(item => item.setURL(footerImageUrl))
            );
        }

        const feedbackChannelId = process.env.FEEDBACK_CHANNEL_ID;
        if (!feedbackChannelId) {
            return interaction.reply({ content: '❌ Feedback channel is not configured. Contact an admin.', ephemeral: true });
        }

        const feedbackChannel = await interaction.guild.channels.fetch(feedbackChannelId).catch(() => null);
        if (!feedbackChannel) {
            return interaction.reply({ content: '❌ Feedback channel could not be found. Contact an admin.', ephemeral: true });
        }

        await feedbackChannel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });

        await interaction.reply({ content: `✅ Feedback sent to ${feedbackChannel}.`, ephemeral: true });
    }
};
