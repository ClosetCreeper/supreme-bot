require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
    }
}

const ACTIVITIES = [
    'Designing banners',
    'Coding bots',
    'Created by: krytec_gaming',
    'Making liveries',
    'Welcome to Supreme Design!',
];
let activityIndex = 0;

client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    const setActivity = () => {
        client.user.setActivity(ACTIVITIES[activityIndex], { type: ActivityType.Playing });
        activityIndex = (activityIndex + 1) % ACTIVITIES.length;
    };
    setActivity();
    setInterval(setActivity, 2000);
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction, client);
            return;
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'order_select') {
                const { handleOrderSelect } = require('./commands/order');
                await handleOrderSelect(interaction, client);
            }
            if (interaction.customId === 'apply_select') {
                const { handleApplySelect } = require('./commands/apply');
                await handleApplySelect(interaction);
            }
            return;
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'order_claim' || interaction.customId === 'order_unclaim') {
                const { handleClaimButton } = require('./commands/order');
                await handleClaimButton(interaction);
            }
            if (interaction.customId.startsWith('apply_approve_') || interaction.customId.startsWith('apply_decline_')) {
                const { handleApplyButton } = require('./commands/apply');
                await handleApplyButton(interaction);
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('apply_modal_')) {
                const { handleApplyModalSubmit } = require('./commands/apply');
                await handleApplyModalSubmit(interaction);
            }
            return;
        }
    } catch (err) {
        console.error(err);
        const msg = { content: '❌ An error occurred.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(msg).catch(() => {});
        } else {
            await interaction.reply(msg).catch(() => {});
        }
    }
});

client.login(process.env.BOT_TOKEN);
