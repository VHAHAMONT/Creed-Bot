// Web server to keep bot alive on Render
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 CREED Bot is running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// Discord bot code
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const Rcon = require('rcon-client').Rcon;
const cron = require('node-cron');

// Create a new Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Your specific channel IDs
const TARGET_CHANNEL_ID = '1440307136872845354'; // For greetings and general notifications
const PZ_NOTIFICATIONS_CHANNEL_ID = '1450141778211766394'; // For PZ server join/leave notifications

// PZ Server RCON Configuration
const RCON_CONFIG = {
  host: process.env.PZ_SERVER_IP || '74.63.203.35',
  port: parseInt(process.env.PZ_RCON_PORT) || 27015,
  password: process.env.PZ_RCON_PASSWORD || 'zombi123creed'
};

// Admin role ID (optional - for restart commands)
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || null;

// Store online players and message history
let onlinePlayers = new Set();
const playerMessageHistory = new Map();
let restartInProgress = false;

// When the bot is ready
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  
  // Start monitoring PZ server
  startPZMonitoring();
  
  // Schedule automatic restarts (example: daily at 3 AM)
  scheduleRestarts();
});

// ==================== RESTART FUNCTIONS ====================

// Send RCON message to server
async function sendRCONMessage(message) {
  let rcon;
  try {
    rcon = await Rcon.connect(RCON_CONFIG);
    await rcon.send(`servermsg "${message}"`);
    console.log(`📢 Sent RCON message: ${message}`);
  } catch (error) {
    console.error('❌ Failed to send RCON message:', error.message);
    throw error;
  } finally {
    if (rcon) rcon.end();
  }
}

// Send RCON command to server
async function sendRCONCommand(command) {
  let rcon;
  try {
    rcon = await Rcon.connect(RCON_CONFIG);
    const response = await rcon.send(command);
    console.log(`🎮 Sent RCON command: ${command}`);
    return response;
  } catch (error) {
    console.error('❌ Failed to send RCON command:', error.message);
    throw error;
  } finally {
    if (rcon) rcon.end();
  }
}

// Post notification to Discord
async function postDiscordNotification(message, isError = false) {
  const channel = client.channels.cache.get(PZ_NOTIFICATIONS_CHANNEL_ID);
  if (channel) {
    const emoji = isError ? '⚠️' : '🔄';
    await channel.send(`${emoji} ${message}`);
  }
}

// Restart countdown sequence
async function executeRestartCountdown() {
  if (restartInProgress) {
    console.log('⚠️ Restart already in progress, skipping...');
    return;
  }
  
  restartInProgress = true;
  
  try {
    // 5 minute warning
    await sendRCONMessage('⚠️ SERVER RESTART IN 5 MINUTES! Please find a safe spot!');
    await postDiscordNotification('**Server will restart in 5 minutes!** ⏰');
    await sleep(2 * 60 * 1000); // 2 minutes
    
    // 3 minute warning
    await sendRCONMessage('⚠️ SERVER RESTART IN 3 MINUTES!');
    await postDiscordNotification('**Server will restart in 3 minutes!** ⏰');
    await sleep(60 * 1000); // 1 minute
    
    // 2 minute warning
    await sendRCONMessage('⚠️ SERVER RESTART IN 2 MINUTES!');
    await postDiscordNotification('**Server will restart in 2 minutes!** ⏰');
    await sleep(60 * 1000); // 1 minute
    
    // 1 minute warning
    await sendRCONMessage('⚠️ SERVER RESTART IN 1 MINUTE! SAVE NOW!');
    await postDiscordNotification('**Server will restart in 1 minute!** 🚨');
    await sleep(30 * 1000); // 30 seconds
    
    // 30 second warning
    await sendRCONMessage('⚠️ SERVER RESTART IN 30 SECONDS!');
    await sleep(20 * 1000); // 20 seconds
    
    // 10 second warning
    await sendRCONMessage('⚠️ SERVER RESTART IN 10 SECONDS!');
    await sleep(10 * 1000); // 10 seconds
    
    // Save and quit
    await sendRCONMessage('🔄 Server restarting now...');
    await postDiscordNotification('**Server is restarting now...** 🔄');
    
    // Send save command first
    await sendRCONCommand('save');
    await sleep(5 * 1000); // Wait 5 seconds for save
    
    // Note: You'll need to manually restart via qPanel or use their API
    // The 'quit' command will shut down the server
    await sendRCONCommand('quit');
    
    await postDiscordNotification('**Server shutdown initiated. Will be back online shortly!** ✅');
    
    console.log('✅ Restart sequence completed');
    
    // Clear online players since server is restarting
    onlinePlayers.clear();
    
  } catch (error) {
    console.error('❌ Error during restart sequence:', error);
    await postDiscordNotification('**Error during restart sequence!** Check logs.', true);
  } finally {
    restartInProgress = false;
  }
}

// Schedule automatic restarts
function scheduleRestarts() {
  // Cron format: second minute hour day month dayOfWeek
  // '0 0 */8 * * *' = Every 8 hours (12 AM, 8 AM, 4 PM)
  
  const restartSchedule = process.env.RESTART_SCHEDULE || '0 0 */8 * * *';
  
  cron.schedule(restartSchedule, async () => {
    console.log('🔄 Scheduled restart triggered');
    await postDiscordNotification('**Scheduled server restart starting...** 🕐');
    await executeRestartCountdown();
  });
  
  console.log(`✅ Restart schedule set: ${restartSchedule}`);
}

// Helper sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== PLAYER MONITORING ====================

async function checkPZPlayers() {
  let rcon;
  
  try {
    rcon = await Rcon.connect(RCON_CONFIG);
    const response = await rcon.send('players');
    const currentPlayers = parsePlayers(response);
    
    // Check for new players (joined)
    for (const player of currentPlayers) {
      if (!onlinePlayers.has(player)) {
        console.log('Player joined:', player);
        await notifyPlayerJoined(player);
        onlinePlayers.add(player);
      }
    }
    
    // Check for players who left
    for (const player of onlinePlayers) {
      if (!currentPlayers.has(player)) {
        console.log('Player left:', player);
        await notifyPlayerLeft(player);
        onlinePlayers.delete(player);
      }
    }
    
  } catch (error) {
    console.error('❌ RCON Error:', error.message);
  } finally {
    if (rcon) rcon.end();
  }
}

function parsePlayers(response) {
  const players = new Set();
  const lines = response.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('-')) {
      const playerName = trimmedLine.substring(1).trim();
      if (playerName) players.add(playerName);
    }
    
    if (trimmedLine.includes('Players connected')) {
      const match = trimmedLine.match(/Players connected \((\d+)\):(.*)/);
      if (match && match[2]) {
        const playerNames = match[2].split(',').map(name => name.trim());
        playerNames.forEach(name => {
          if (name && name !== '') players.add(name);
        });
      }
    }
  }
  
  return players;
}

async function notifyPlayerJoined(playerName) {
  const channel = client.channels.cache.get(PZ_NOTIFICATIONS_CHANNEL_ID);
  if (channel) {
    const message = await channel.send(`🎮 **${playerName}** joined the CREED PZ server! 🟢`);
    
    if (!playerMessageHistory.has(playerName)) {
      playerMessageHistory.set(playerName, []);
    }
    playerMessageHistory.get(playerName).push(message.id);
  }
}

async function notifyPlayerLeft(playerName) {
  const channel = client.channels.cache.get(PZ_NOTIFICATIONS_CHANNEL_ID);
  if (channel) {
    const message = await channel.send(`🎮 **${playerName}** left the CREED PZ server. 🔴`);
    
    if (!playerMessageHistory.has(playerName)) {
      playerMessageHistory.set(playerName, []);
    }
    playerMessageHistory.get(playerName).push(message.id);
    
    setTimeout(async () => {
      await deletePlayerMessages(playerName, channel);
    }, 3000);
  }
}

async function deletePlayerMessages(playerName, channel) {
  const messageIds = playerMessageHistory.get(playerName);
  
  if (!messageIds || messageIds.length === 0) return;
  
  for (const messageId of messageIds) {
    try {
      const message = await channel.messages.fetch(messageId);
      await message.delete();
    } catch (error) {
      console.error(`Failed to delete message ${messageId}:`, error.message);
    }
  }
  
  playerMessageHistory.delete(playerName);
}

function startPZMonitoring() {
  console.log('🎮 Starting PZ server monitoring...');
  checkPZPlayers();
  setInterval(checkPZPlayers, 30000);
}

// ==================== DISCORD COMMANDS ====================

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID);

  // Existing commands
  if (content === 'hi' || content === 'hello' || content === 'hey') {
    if (targetChannel) {
      targetChannel.send(`${message.author} said hi in ${message.channel}! 👋`);
    }
    message.reply('Hi there! 👋');
  }

  if (content === 'bye' || content === 'goodbye' || content === 'see you') {
    if (targetChannel) {
      targetChannel.send(`${message.author} said bye in ${message.channel}! 👋`);
    }
    message.reply('Bye! See you later! 👋');
  }
  
  // Check who's online
  if (content === '!players' || content === '!online') {
    if (onlinePlayers.size === 0) {
      message.reply('No players are currently online on the PZ server.');
    } else {
      const playerList = Array.from(onlinePlayers).join(', ');
      message.reply(`🎮 Players online (${onlinePlayers.size}): ${playerList}`);
    }
  }
  
  // Test RCON
  if (content === '!testrcon') {
    message.reply('Testing RCON connection... Check logs for details.');
    checkPZPlayers();
  }
  
  // NEW COMMANDS
  
  // Manual restart command (admin only)
  if (content === '!restart' || content === '!restartserver') {
    // Check if user has admin permissions
    const isAdmin = ADMIN_ROLE_ID ? 
      message.member.roles.cache.has(ADMIN_ROLE_ID) : 
      message.member.permissions.has(PermissionFlagsBits.Administrator);
    
    if (!isAdmin) {
      return message.reply('❌ You need administrator permissions to restart the server.');
    }
    
    if (restartInProgress) {
      return message.reply('⚠️ A restart is already in progress!');
    }
    
    message.reply('✅ Server restart initiated! Countdown starting...');
    await executeRestartCountdown();
  }
  
  // Send custom announcement to server (admin only)
  if (content.startsWith('!announce ')) {
    const isAdmin = ADMIN_ROLE_ID ? 
      message.member.roles.cache.has(ADMIN_ROLE_ID) : 
      message.member.permissions.has(PermissionFlagsBits.Administrator);
    
    if (!isAdmin) {
      return message.reply('❌ You need administrator permissions to send announcements.');
    }
    
    const announcement = message.content.substring(10); // Remove "!announce "
    
    try {
      await sendRCONMessage(announcement);
      message.reply(`✅ Announcement sent to server: "${announcement}"`);
    } catch (error) {
      message.reply('❌ Failed to send announcement. Check bot logs.');
    }
  }
  
  // Help command
  if (content === '!help' || content === '!commands') {
    const helpMessage = `
**CREED PZ Bot Commands:**
• \`!players\` or \`!online\` - Check who's online
• \`!testrcon\` - Test RCON connection

**Admin Commands:**
• \`!restart\` - Manually trigger server restart with countdown
• \`!announce <message>\` - Send announcement to in-game chat
• \`!help\` - Show this message

**Automatic Features:**
• Server restarts scheduled daily at configured time
• Join/leave notifications
• Member welcome/goodbye messages
    `;
    message.reply(helpMessage);
  }
});

// Welcome/Goodbye for Discord members
client.on('guildMemberAdd', (member) => {
  const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID);
  if (targetChannel) {
    targetChannel.send(`Welcome to the server, ${member}! 🎉`);
  }
});

client.on('guildMemberRemove', (member) => {
  const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID);
  if (targetChannel) {
    targetChannel.send(`Goodbye, ${member.user.tag}! We'll miss you! 👋`);
  }
});

// Login
client.login(process.env.DISCORD_TOKEN);