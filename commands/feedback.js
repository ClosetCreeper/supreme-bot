const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function renderStars(rating) {
    let result = '';
    for (let i = 0; i < 5; i++) {
        result += i < rating ? '⭐' : '☆';
    }
    return result;
}

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
            .setMinValue(1)
            .setMaxValue(5)
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

        const embed = new EmbedBuilder()
            .setTitle('Designer feedback')
            .addFields(
                { name: 'User', value: interaction.user.toString() },
                { name: 'Designer', value: targetUser.toString() },
                { name: 'Rating', value: `${renderStars(stars)}` },
                { name: 'Feedback', value: feedbackText || 'No written feedback' }
            )
            .setColor(0x1e90ff)
            .setTimestamp();

        // Top banner — set FEEDBACK_BANNER_URL in .env
        const bannerUrl = process.env.FEEDBACK_BANNER_URL;
        if (bannerUrl) embed.setImage(bannerUrl);

        const embeds = [embed];

        // Bottom footer pill image — set FEEDBACK_FOOTER_URL in .env
        const footerImageUrl = process.env.FEEDBACK_FOOTER_URL;
        if (footerImageUrl) {
            const footerEmbed = new EmbedBuilder().setImage(footerImageUrl);
            embeds.push(footerEmbed);
        }

        const feedbackChannelId = process.env.FEEDBACK_CHANNEL_ID;
        if (!feedbackChannelId) {
            return interaction.reply({ content: '❌ Feedback channel is not configured. Contact an admin.', ephemeral: true });
        }

        const feedbackChannel = await interaction.guild.channels.fetch(feedbackChannelId).catch(() => null);
        if (!feedbackChannel) {
            return interaction.reply({ content: '❌ Feedback channel could not be found. Contact an admin.', ephemeral: true });
        }

        await feedbackChannel.send({ embeds });
        await interaction.reply({ content: `✅ Feedback sent to ${feedbackChannel}.`, ephemeral: true });
    }
};
