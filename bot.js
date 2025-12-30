// Web server to keep bot alive on Render
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 CREED Bot is running!');
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    onlinePlayers: onlinePlayers.size,
    restartInProgress: restartInProgress
  });
});

app.listen(PORT, () => {
  log('INFO', `Web server running on port ${PORT}`);
});

// Discord bot code
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const Rcon = require('rcon-client').Rcon;
const cron = require('node-cron');

// ==================== CONFIGURATION ====================

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'PZ_SERVER_IP', 'PZ_RCON_PORT', 'PZ_RCON_PASSWORD'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please set these in your .env file or hosting environment.');
  process.exit(1);
}

// Channel IDs
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || '1440307136872845354';
const PZ_NOTIFICATIONS_CHANNEL_ID = process.env.PZ_NOTIFICATIONS_CHANNEL_ID || '1450141778211766394';
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID || '1440309180979347486';

// PZ Server RCON Configuration
const RCON_CONFIG = {
  host: process.env.PZ_SERVER_IP,
  port: parseInt(process.env.PZ_RCON_PORT),
  password: process.env.PZ_RCON_PASSWORD
};

// Admin role ID
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || null;

// Cooldown settings (in seconds)
const COMMAND_COOLDOWNS = {
  restart: 60,
  announce: 10,
  players: 5,
  dcmessage: 10,
};

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// State management
let onlinePlayers = new Set();
const playerMessageHistory = new Map();
let restartInProgress = false;
const cooldowns = new Map();
let rconConnection = null;
let rconReconnecting = false;

// ==================== UTILITY FUNCTIONS ====================

// Enhanced logging with timestamps
function log(level, message, error = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  
  if (level === 'ERROR') {
    console.error(logMessage);
    if (error) console.error(error);
  } else {
    console.log(logMessage);
  }
}

// Sanitize user input to prevent injection
function sanitizeMessage(message) {
  if (typeof message !== 'string') return '';
  // Remove quotes, backslashes, and limit length
  return message
    .replace(/['"\\]/g, '')
    .replace(/[^\x20-\x7E]/g, '') // Remove non-printable characters
    .substring(0, 200);
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check cooldown for commands
function checkCooldown(userId, commandName) {
  const cooldownKey = `${commandName}-${userId}`;
  const cooldownTime = COMMAND_COOLDOWNS[commandName] || 5;
  
  if (cooldowns.has(cooldownKey)) {
    const expirationTime = cooldowns.get(cooldownKey) + (cooldownTime * 1000);
    const now = Date.now();
    
    if (now < expirationTime) {
      const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
      return { onCooldown: true, timeLeft };
    }
  }
  
  cooldowns.set(cooldownKey, Date.now());
  setTimeout(() => cooldowns.delete(cooldownKey), cooldownTime * 1000);
  
  return { onCooldown: false };
}

// Cleanup old player message history (prevent memory leaks)
function cleanupMessageHistory() {
  const maxAge = 60 * 60 * 1000; // 1 hour
  const now = Date.now();
  
  for (const [playerName, data] of playerMessageHistory.entries()) {
    if (data.timestamp && (now - data.timestamp) > maxAge) {
      playerMessageHistory.delete(playerName);
      log('DEBUG', `Cleaned up old message history for ${playerName}`);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupMessageHistory, 30 * 60 * 1000);

// ==================== RCON CONNECTION MANAGEMENT ====================

async function connectRCON() {
  // Close existing connection if present
  if (rconConnection) {
    try {
      rconConnection.end();
    } catch (error) {
      // Ignore close errors
    }
    rconConnection = null;
  }
  
  try {
    rconConnection = await Rcon.connect(RCON_CONFIG);
    log('INFO', 'RCON connection established');
    return rconConnection;
  } catch (error) {
    log('ERROR', 'Failed to connect to RCON', error);
    rconConnection = null;
    throw error;
  }
}

async function ensureRCONConnection() {
  if (!rconConnection || !rconConnection.authenticated) {
    return await connectRCON();
  }
  return rconConnection;
}

// Send RCON message to server
async function sendRCONMessage(message) {
  const sanitized = sanitizeMessage(message);
  if (!sanitized) {
    log('WARN', 'Attempted to send empty message via RCON');
    return;
  }
  
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      const rcon = await ensureRCONConnection();
      await rcon.send(`servermsg "${sanitized}"`);
      log('INFO', `📢 Sent RCON message: ${sanitized}`);
      return true;
    } catch (error) {
      attempts++;
      log('ERROR', `Failed to send RCON message (attempt ${attempts}/${maxAttempts})`, error);
      rconConnection = null;
      
      if (attempts < maxAttempts) {
        await sleep(2000);
      }
    }
  }
  
  return false;
}

async function sendRCONCommand(command) {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      const rcon = await ensureRCONConnection();
      const response = await rcon.send(command);
      log('INFO', `🎮 Sent RCON command: ${command}`);
      return response;
    } catch (error) {
      attempts++;
      log('ERROR', `Failed to send RCON command (attempt ${attempts}/${maxAttempts})`, error);
      
      if (attempts < maxAttempts) {
        await sleep(2000);
      }
      // Don't return here - let the loop continue
    }
  }
  
  // Only reached if all attempts failed
  log('ERROR', 'Failed to send RCON command after all attempts exhausted');
  return null;
}

// ==================== DISCORD NOTIFICATIONS ====================

async function postDiscordNotification(message, isError = false) {
  try {
    const channel = client.channels.cache.get(PZ_NOTIFICATIONS_CHANNEL_ID);
    if (channel) {
      const emoji = isError ? '⚠️' : '🔄';
      await channel.send(`${emoji} ${message}`);
    }
  } catch (error) {
    log('ERROR', 'Failed to post Discord notification', error);
  }
}

// ==================== RESTART FUNCTIONS ====================

// Restart timing configuration
const RESTART_TIMINGS = [
  { minutes: 5, wait: 120000, message: '⚠️ SERVER RESTART IN 5 MINUTES! Please find a safe spot!', discord: '**Server will restart in 5 minutes!** ⏰' },
  { minutes: 3, wait: 60000, message: '⚠️ SERVER RESTART IN 3 MINUTES!', discord: '**Server will restart in 3 minutes!** ⏰' },
  { minutes: 2, wait: 60000, message: '⚠️ SERVER RESTART IN 2 MINUTES!', discord: '**Server will restart in 2 minutes!** ⏰' },
  { minutes: 1, wait: 30000, message: '⚠️ SERVER RESTART IN 1 MINUTE! SAVE NOW!', discord: '**Server will restart in 1 minute!** 🚨' },
  { seconds: 30, wait: 20000, message: '⚠️ SERVER RESTART IN 30 SECONDS!', discord: null },
  { seconds: 10, wait: 10000, message: '⚠️ SERVER RESTART IN 10 SECONDS!', discord: null }
];

async function executeRestartCountdown() {
  try {
    log('INFO', '🔄 Starting restart countdown sequence...');
    
    // Send warnings
    for (const timing of RESTART_TIMINGS) {
      const success = await sendRCONMessage(timing.message);
      if (!success) {
        log('WARN', `Failed to send RCON warning: ${timing.message}`);
      }
      
      if (timing.discord) {
        await postDiscordNotification(timing.discord);
      }
      
      if (timing.wait) {
        await sleep(timing.wait);
      }
    }
    
    // Final notification
    await sendRCONMessage('🔄 Server restarting now...');
    await postDiscordNotification('**Server is restarting now...** 🔄');
    
    // Save the world
    log('INFO', 'Sending save command...');
    const saveResponse = await sendRCONCommand('save');
    if (!saveResponse) {
      log('ERROR', 'Save command failed! Aborting restart.');
      await postDiscordNotification('**⚠️ Save command failed! Restart aborted.**', true);
      return false;
    }
    
    log('INFO', 'Waiting for save to complete...');
    await sleep(5000); // Wait 5 seconds for save
    
    // Quit server (requires external process manager to restart)
    log('INFO', 'Sending quit command...');
    const quitResponse = await sendRCONCommand('quit');
    if (!quitResponse) {
      log('ERROR', 'Quit command failed!');
      await postDiscordNotification('**⚠️ Quit command failed! Manual intervention required.**', true);
      return false;
    }
    
    await postDiscordNotification('**Server shutdown initiated. Will be back online shortly!** ✅');
    log('INFO', '✅ Restart sequence completed successfully');
    
    // Clear online players since server is restarting
    onlinePlayers.clear();
    
    return true;
  } catch (error) {
    log('ERROR', 'Error during restart sequence', error);
    await postDiscordNotification('**Error during restart sequence!** Check logs.', true);
    return false;
  }
}

// Schedule automatic restarts
function scheduleRestarts() {
  const restartSchedule = process.env.RESTART_SCHEDULE || '0 0 */8 * * *';
  
  try {
    cron.schedule(restartSchedule, async () => {
      if (restartInProgress) {
        log('WARN', 'Scheduled restart skipped - restart already in progress');
        return;
      }
      
      restartInProgress = true;
      
      try {
        log('INFO', '🔄 Scheduled restart triggered');
        await postDiscordNotification('**Scheduled server restart starting...** 🕐');
        await executeRestartCountdown();
      } catch (error) {
        log('ERROR', 'Scheduled restart failed', error);
      } finally {
        restartInProgress = false;
      }
    });
    
    log('INFO', `✅ Restart schedule set: ${restartSchedule}`);
  } catch (error) {
    log('ERROR', 'Failed to schedule restarts', error);
  }
}

// ==================== PLAYER MONITORING ====================

async function checkPZPlayers() {
  try {
    const response = await sendRCONCommand('players');
    const currentPlayers = parsePlayers(response);
    
    // Check for new players (joined)
    for (const player of currentPlayers) {
      if (!onlinePlayers.has(player)) {
        log('INFO', `Player joined: ${player}`);
        await notifyPlayerJoined(player);
        onlinePlayers.add(player);
      }
    }
    
    // Check for players who left
    for (const player of onlinePlayers) {
      if (!currentPlayers.has(player)) {
        log('INFO', `Player left: ${player}`);
        await notifyPlayerLeft(player);
        onlinePlayers.delete(player);
      }
    }
  } catch (error) {
    log('ERROR', 'RCON error during player check', error);
  }
}

function parsePlayers(response) {
  const players = new Set();
  if (!response || typeof response !== 'string') return players;
  
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
  try {
    const channel = client.channels.cache.get(PZ_NOTIFICATIONS_CHANNEL_ID);
    if (channel) {
      const message = await channel.send(`🎮 **${playerName}** joined the CREED PZ server! 🟢`);
      
      if (!playerMessageHistory.has(playerName)) {
        playerMessageHistory.set(playerName, { 
          messages: [], 
          timestamp: Date.now() 
        });
      }
      playerMessageHistory.get(playerName).messages.push(message.id);
    }
  } catch (error) {
    log('ERROR', 'Failed to send player joined notification', error);
  }
}

async function notifyPlayerLeft(playerName) {
  try {
    const channel = client.channels.cache.get(PZ_NOTIFICATIONS_CHANNEL_ID);
    if (channel) {
      const message = await channel.send(`🎮 **${playerName}** left the CREED PZ server. 🔴`);
      
      const historyData = playerMessageHistory.get(playerName);
      if (historyData) {
        historyData.messages.push(message.id);
      } else {
        playerMessageHistory.set(playerName, { 
          messages: [message.id], 
          timestamp: Date.now() 
        });
      }
      
      // Delete messages after 3 seconds
      setTimeout(async () => {
        await deletePlayerMessages(playerName, channel);
      }, 3000);
    }
  } catch (error) {
    log('ERROR', 'Failed to send player left notification', error);
  }
}

async function deletePlayerMessages(playerName, channel) {
  const historyData = playerMessageHistory.get(playerName);
  
  if (!historyData || !historyData.messages || historyData.messages.length === 0) return;
  
  for (const messageId of historyData.messages) {
    try {
      const message = await channel.messages.fetch(messageId);
      await message.delete();
    } catch (error) {
      log('WARN', `Failed to delete message ${messageId}`, error);
    }
  }
  
  playerMessageHistory.delete(playerName);
}

function startPZMonitoring() {
  log('INFO', '🎮 Starting PZ server monitoring...');
  checkPZPlayers();
  setInterval(checkPZPlayers, 30000); // Check every 30 seconds
}

// ==================== DISCORD EVENT HANDLERS ====================

client.once('ready', () => {
  log('INFO', `✅ Logged in as ${client.user.tag}!`);
  
  // Start monitoring PZ server
  startPZMonitoring();
  
  // Schedule automatic restarts
  scheduleRestarts();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID);

  try {
    // Greeting commands
    if (content === 'hi' || content === 'hello' || content === 'hey') {
      if (targetChannel) {
        targetChannel.send(`${message.author} said hi in ${message.channel}! 👋`);
      }
      await message.reply('Hi there! 👋');
      return;
    }

    if (content === 'bye' || content === 'goodbye' || content === 'see you') {
      if (targetChannel) {
        targetChannel.send(`${message.author} said bye in ${message.channel}! 👋`);
      }
      await message.reply('Bye! See you later! 👋');
      return;
    }
    
    // Player list command
    if (content === '!players' || content === '!online') {
      const cooldown = checkCooldown(message.author.id, 'players');
      if (cooldown.onCooldown) {
        return message.reply(`⏳ Please wait ${cooldown.timeLeft}s before using this command again.`);
      }
      
      if (onlinePlayers.size === 0) {
        await message.reply('No players are currently online on the PZ server.');
      } else {
        const playerList = Array.from(onlinePlayers).join(', ');
        await message.reply(`🎮 Players online (${onlinePlayers.size}): ${playerList}`);
      }
      return;
    }
    
    // Test RCON
    if (content === '!testrcon') {
      await message.reply('Testing RCON connection... Check logs for details.');
      checkPZPlayers();
      return;
    }
    
    // Manual restart command (admin only)
    if (content === '!restart' || content === '!restartserver') {
      const isAdmin = ADMIN_ROLE_ID ? 
        message.member.roles.cache.has(ADMIN_ROLE_ID) : 
        message.member.permissions.has(PermissionFlagsBits.Administrator);
  
      if (!isAdmin) {
        return message.reply('❌ You need administrator permissions to restart the server.');
      }
  
      const cooldown = checkCooldown(message.author.id, 'restart');
      if (cooldown.onCooldown) {
        return message.reply(`⏳ Please wait ${cooldown.timeLeft}s before using this command again.`);
      }
  
      if (restartInProgress) {
        return message.reply('⚠️ A restart is already in progress!');
      }
  
      restartInProgress = true;  // Set the flag
  
      try {
        await message.reply('✅ Server restart initiated! Countdown starting...');
        const success = await executeRestartCountdown();
    
        if (!success) {
          await message.reply('❌ Restart failed! Check notifications channel for details.');
        }
      } catch (error) {
        log('ERROR', 'Manual restart command failed', error);
        await message.reply('❌ An error occurred during restart. Check logs.');
      } finally {
        restartInProgress = false;  // Always reset the flag
      }
      return;
    }
    
    // Send custom announcement (admin only)
    if (content.startsWith('!announce ')) {
      const isAdmin = ADMIN_ROLE_ID ? 
        message.member.roles.cache.has(ADMIN_ROLE_ID) : 
        message.member.permissions.has(PermissionFlagsBits.Administrator);
      
      if (!isAdmin) {
        return message.reply('❌ You need administrator permissions to send announcements.');
      }
      
      const cooldown = checkCooldown(message.author.id, 'announce');
      if (cooldown.onCooldown) {
        return message.reply(`⏳ Please wait ${cooldown.timeLeft}s before using this command again.`);
      }
      
      const announcement = message.content.substring(10); // Remove "!announce "
      
      if (!announcement.trim()) {
        return message.reply('❌ Please provide a message to announce.');
      }
      
      const success = await sendRCONMessage(announcement);
      if (success) {
        await message.reply(`✅ Announcement sent to server: "${sanitizeMessage(announcement)}"`);
      } else {
        await message.reply('❌ Failed to send announcement. Check bot logs.');
      }
      return;
    }

    // Send Discord announcement (admin only)
    if (content.startsWith('!dcmessage ')) {
      const isAdmin = ADMIN_ROLE_ID ? 
        message.member.roles.cache.has(ADMIN_ROLE_ID) : 
        message.member.permissions.has(PermissionFlagsBits.Administrator);
    
      if (!isAdmin) {
        return message.reply('❌ You need administrator permissions to send Discord announcements.');
      }

      const cooldown = checkCooldown(message.author.id, 'dcmessage');
      if (cooldown.onCooldown) {
        return message.reply(`⏳ Please wait ${cooldown.timeLeft}s before using this command again.`);
      }

      let fullText = message.content.substring(11).trim(); // Remove "!dcmessage "
      let targetChannelId = ANNOUNCEMENT_CHANNEL_ID; // Default channel
      let announcement = fullText;

      // Check if first word is a channel ID (starts with a number and is 17-20 chars long)
      const words = fullText.split(' ');
      if (words.length > 0 && /^\d{17,20}$/.test(words[0])) {
        targetChannelId = words[0];
        announcement = words.slice(1).join(' ').trim();
      }

      // Check if there's either text or an attachment
      if (!announcement && message.attachments.size === 0) {
        return message.reply('❌ Please provide a message and/or image to send.\n**Usage:** `!dcmessage [channel_id] <message>` or attach images');
      }

      try {
        const announcementChannel = client.channels.cache.get(targetChannelId);
        
        if (!announcementChannel) {
          return message.reply(`❌ Channel not found! Make sure the channel ID is correct.\n**Tip:** Right-click a channel and select "Copy Channel ID"`);
        }

        // Check if bot has permission to send messages in that channel
        if (!announcementChannel.permissionsFor(client.user).has(PermissionFlagsBits.SendMessages)) {
          return message.reply('❌ Bot does not have permission to send messages in that channel.');
        }

        // Prepare message options
        const messageOptions = {};
    
        // Add text content if provided
        if (announcement) {
          messageOptions.content = announcement;
        }
    
       // Add attachments (images) if any
        if (message.attachments.size > 0) {
          messageOptions.files = Array.from(message.attachments.values());
        }

        // Send the announcement
        await announcementChannel.send(messageOptions);
    
        // Confirm to the admin
        let confirmationMsg = `✅ Announcement sent to <#${targetChannelId}>!`;
        if (message.attachments.size > 0) {
          confirmationMsg += ` (with ${message.attachments.size} image${message.attachments.size > 1 ? 's' : ''})`;
        }
        await message.reply(confirmationMsg);
    
        log('INFO', `📣 Discord announcement sent by ${message.author.tag} to channel ${targetChannelId}: ${announcement || '[Image only]'} ${message.attachments.size > 0 ? `with ${message.attachments.size} attachment(s)` : ''}`);
      } catch (error) {
        log('ERROR', 'Failed to send Discord announcement', error);
        await message.reply('❌ Failed to send announcement. Check bot logs.');
      }
      return;
    }
    
    // Help command
    if (content === '!help' || content === '!commands') {
      const helpMessage = `
**CREED PZ Bot Commands:**

**General Commands:**
- \`!players\` or \`!online\` - Check who's online
- \`!testrcon\` - Test RCON connection
- \`!help\` or \`!commands\` - Show this message

**Admin Commands:**
- \`!restart\` - Manually trigger server restart with countdown
- \`!announce <message>\` - Send announcement to in-game chat
- \`!dcmessage <message>\` - Send announcement to Discord channel

**Automatic Features:**
- Server restarts scheduled (check schedule with admin)
- Join/leave notifications
- Member welcome/goodbye messages

**Note:** Commands have cooldowns to prevent spam.
      `;
      await message.reply(helpMessage);
      return;
    }
  } catch (error) {
    log('ERROR', 'Error handling message', error);
    try {
      await message.reply('❌ An error occurred while processing your command.');
    } catch (replyError) {
      log('ERROR', 'Failed to send error message', replyError);
    }
  }
});

// Welcome new members
client.on('guildMemberAdd', async (member) => {
  try {
    const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID);
    if (targetChannel) {
      await targetChannel.send(`Welcome to the server, ${member}! 🎉`);
    }
  } catch (error) {
    log('ERROR', 'Error in guildMemberAdd event', error);
  }
});

// Goodbye to leaving members
client.on('guildMemberRemove', async (member) => {
  try {
    const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID);
    if (targetChannel) {
      await targetChannel.send(`Goodbye, ${member.user.tag}! We'll miss you! 👋`);
    }
  } catch (error) {
    log('ERROR', 'Error in guildMemberRemove event', error);
  }
});

// Handle errors
client.on('error', (error) => {
  log('ERROR', 'Discord client error', error);
});

process.on('unhandledRejection', (error) => {
  log('ERROR', 'Unhandled promise rejection', error);
});

process.on('uncaughtException', (error) => {
  log('ERROR', 'Uncaught exception', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  log('INFO', 'Received SIGINT, shutting down gracefully...');
  if (rconConnection) {
    try {
      rconConnection.end();
    } catch (error) {
      log('ERROR', 'Error closing RCON connection', error);
    }
  }
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('INFO', 'Received SIGTERM, shutting down gracefully...');
  if (rconConnection) {
    try {
      rconConnection.end();
    } catch (error) {
      log('ERROR', 'Error closing RCON connection', error);
    }
  }
  client.destroy();
  process.exit(0);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch(error => {
  log('ERROR', 'Failed to login to Discord', error);
  process.exit(1);
});