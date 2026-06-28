const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Roblox marketplace tax is 30% — seller receives 70% of the listed price.
// To RECEIVE X:  list price = ceil(X / 0.7)
// When PAID X:   you receive = floor(X * 0.7)

// Set this to your uploaded Robux emoji, e.g. <:robux:1234567890>
// If left empty, falls back to the Roblox unicode logo approximation
const ROBUX_EMOJI = process.env.ROBUX_EMOJI || 'R$';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tax')
        .setDescription('Calculate Roblox marketplace tax (30%)')
        .addIntegerOption(opt => opt
            .setName('robux')
            .setDescription('The Robux amount to calculate tax for')
            .setRequired(true)
            .setMinValue(1)
        ),

    async execute(interaction) {
        const amount = interaction.options.getInteger('robux');

        const toReceive  = Math.ceil(amount / 0.7);   // list this to receive the amount
        const youReceive = Math.floor(amount * 0.7);  // receive this when paid the amount

        const R = ROBUX_EMOJI;

        const embed = new EmbedBuilder()
            .setTitle('Roblox Tax Calculator')
            .setDescription(
                `> To receive **${R} ${amount.toLocaleString()}**, you need to be paid **${R} ${toReceive.toLocaleString()}**.\n` +
                `> When being paid **${R} ${amount.toLocaleString()}**, you will receive **${R} ${youReceive.toLocaleString()}**.`
            )
            .setColor(0x1e90ff)
            .setFooter({ text: `Requested by ${interaction.user.tag}` });

        await interaction.reply({ embeds: [embed] });
    }
};
