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
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction, client);
        } catch (err) {
            console.error(err);
            const msg = { content: '❌ An error occurred.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(msg);
            } else {
                await interaction.reply(msg);
            }
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'order_select') {
            const { handleOrderSelect } = require('./commands/order');
            await handleOrderSelect(interaction, client);
        }
    }
});

client.login(process.env.BOT_TOKEN);