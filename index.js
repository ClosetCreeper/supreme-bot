require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, ActivityType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
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
    // Register the /ticket command from dashboard.js
    if (command.ticketData && command.ticketExecute) {
        client.commands.set('ticket', {
            ENV: command.ENV,
            data: command.ticketData,
            execute: command.ticketExecute,
        });
    }
}

const ACTIVITIES = [
    'Designing banners',
    'Coding bots',
    'Created by: krytec_gaming',
    'Making liveries',
    'Welcome to Atlas Development!',
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

// ─── Dev gate helper ──────────────────────────────────────────────────────────
function isDevLocked(commandModule, userId) {
    if (commandModule?.ENV !== 'dev') return false;
    const devId = process.env.DEV_USER_ID;
    return devId && userId !== devId;
}

async function replyDevLocked(interaction) {
    const msg = { content: '🚧 This command is currently in maintenance mode.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
    } else if (interaction.isRepliable()) {
        await interaction.reply(msg).catch(() => {});
    }
}
// ─────────────────────────────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.warn(`⚠️ No handler found for command: ${interaction.commandName}`);
                return;
            }
            if (isDevLocked(command, interaction.user.id)) return replyDevLocked(interaction);
            await command.execute(interaction, client);
            return;
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'order_select') {
                const mod = require('./commands/order');
                if (isDevLocked(mod, interaction.user.id)) return replyDevLocked(interaction);
                await mod.handleOrderSelect(interaction, client);
            }
            if (interaction.customId === 'apply_select') {
                const mod = require('./commands/apply');
                if (isDevLocked(mod, interaction.user.id)) return replyDevLocked(interaction);
                await mod.handleApplySelect(interaction);
            }
            if (interaction.customId === 'support_select') {
                const mod = require('./commands/dashboard');
                if (isDevLocked(mod, interaction.user.id)) return replyDevLocked(interaction);
                await mod.handleSupportSelect(interaction);
            }
            return;
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'order_claim' || interaction.customId === 'order_unclaim') {
                const mod = require('./commands/order');
                if (isDevLocked(mod, interaction.user.id)) return replyDevLocked(interaction);
                await mod.handleClaimButton(interaction);
            }
            if (interaction.customId.startsWith('apply_approve_') || interaction.customId.startsWith('apply_decline_')) {
                const mod = require('./commands/apply');
                if (isDevLocked(mod, interaction.user.id)) return replyDevLocked(interaction);
                await mod.handleApplyButton(interaction);
            }
            if (interaction.customId.startsWith('coursecreator_approve_') || interaction.customId.startsWith('coursecreator_decline_')) {
                const mod = require('./commands/coursecreator');
                if (isDevLocked(mod, interaction.user.id)) return replyDevLocked(interaction);
                await mod.handleApplyButton(interaction);
            }
            if (interaction.customId === 'dashboard_support') {
                const mod = require('./commands/dashboard');
                if (isDevLocked(mod, interaction.user.id)) return replyDevLocked(interaction);
                await mod.handleSupportButton(interaction);
            }
            if (interaction.customId === 'support_claim' || interaction.customId === 'support_unclaim') {
                const mod = require('./commands/dashboard');
                if (isDevLocked(mod, interaction.user.id)) return replyDevLocked(interaction);
                await mod.handleClaimButton(interaction);
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('apply_modal_')) {
                const mod = require('./commands/apply');
                if (isDevLocked(mod, interaction.user.id)) return replyDevLocked(interaction);
                await mod.handleApplyModalSubmit(interaction);
            }
            if (interaction.customId === 'coursecreator_apply_modal') {
                const mod = require('./commands/coursecreator');
                if (isDevLocked(mod, interaction.user.id)) return replyDevLocked(interaction);
                await mod.handleApplyModalSubmit(interaction);
            }
            if (interaction.customId.startsWith('support_modal_')) {
                const mod = require('./commands/dashboard');
                if (isDevLocked(mod, interaction.user.id)) return replyDevLocked(interaction);
                await mod.handleSupportModalSubmit(interaction);
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

// ─── ,purge [#] ───────────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(',purge ')) return;

    const isStaff = process.env.STAFF_ROLE_ID
        ? message.member?.roles.cache.has(process.env.STAFF_ROLE_ID)
        : message.member?.permissions.has(PermissionFlagsBits.ManageMessages);

    if (!isStaff) {
        return message.reply({ content: '❌ Staff only.', allowedMentions: { repliedUser: false } })
            .then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
    }

    const amount = parseInt(message.content.split(' ')[1]);
    if (isNaN(amount) || amount < 1 || amount > 100) {
        return message.reply({ content: '❌ Please provide a number between 1 and 100.', allowedMentions: { repliedUser: false } })
            .then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
    }

    await message.delete().catch(() => {});
    const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);
    const count = deleted?.size ?? 0;

    const confirm = await message.channel.send(`🗑️ Deleted **${count}** message${count !== 1 ? 's' : ''}.`);
    setTimeout(() => confirm.delete().catch(() => {}), 3000);
});
// ─────────────────────────────────────────────────────────────────────────────

// ─── Quota message tracking ────────────────────────────────────────────────────
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.member) return;
    try {
        await require('./commands/quota').trackMessage(message);
    } catch (err) {
        console.error('Quota tracking failed:', err);
    }
});
// ─────────────────────────────────────────────────────────────────────────────

client.login(process.env.BOT_TOKEN);
