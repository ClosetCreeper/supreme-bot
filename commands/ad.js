const { SlashCommandBuilder } = require('discord.js');

const AD_CONTENT = [
    '```',
    'Worlds most advanced course design.',
    '```',
    '**Daily updates and more ways to make everything easier**',
    '',
    'If you want to find out come and join and stay!',
    '> NOTE : ***Not all been released yet.***',
    '',
    'https://discord.gg/hAt9gqPugV',
].join('\n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ad')
        .setDescription('Post the server advertisement'),

    async execute(interaction) {
        await interaction.reply({ content: AD_CONTENT });
    },
};
