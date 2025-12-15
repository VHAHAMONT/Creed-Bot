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
const { Client, GatewayIntentBits } = require('discord.js');
const Rcon = require('rcon-client').Rcon;

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
  host: process.env.PZ_SERVER_IP || 'your_server_ip',
  port: parseInt(process.env.PZ_RCON_PORT) || 27015,
  password: process.env.PZ_RCON_PASSWORD || 'your_rcon_password'
};

// Store online players
let onlinePlayers = new Set();

// When the bot is ready
client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  
  // Start monitoring PZ server
  startPZMonitoring();
});

// Function to check PZ server players
async function checkPZPlayers() {
  let rcon;
  
  try {
    // Connect to RCON
    rcon = await Rcon.connect(RCON_CONFIG);
    
    // Get player list
    const response = await rcon.send('players');
    
    // Parse the response to get current players
    const currentPlayers = parsePlayers(response);
    
    // Check for new players (joined)
    for (const player of currentPlayers) {
      if (!onlinePlayers.has(player)) {
        await notifyPlayerJoined(player);
        onlinePlayers.add(player);
      }
    }
    
    // Check for players who left
    for (const player of onlinePlayers) {
      if (!currentPlayers.has(player)) {
        await notifyPlayerLeft(player);
        onlinePlayers.delete(player);
      }
    }
    
  } catch (error) {
    console.error('RCON Error:', error.message);
  } finally {
    if (rcon) {
      rcon.end();
    }
  }
}

// Parse player list from RCON response
function parsePlayers(response) {
  const players = new Set();
  
  // PZ RCON returns something like:
  // "Players connected (2): PlayerName1, PlayerName2"
  const lines = response.split('\n');
  
  for (const line of lines) {
    if (line.includes('Players connected')) {
      const match = line.match(/Players connected \((\d+)\):(.*)/);
      if (match && match[2]) {
        const playerNames = match[2].split(',').map(name => name.trim());
        playerNames.forEach(name => {
          if (name) players.add(name);
        });
      }
    }
  }
  
  return players;
}

// Notify when player joins
async function notifyPlayerJoined(playerName) {
  const channel = client.channels.cache.get(PZ_NOTIFICATIONS_CHANNEL_ID);
  if (channel) {
    await channel.send(`🎮 **${playerName}** joined the Creed PZ server! 🟢`);
  }
}

// Notify when player leaves
async function notifyPlayerLeft(playerName) {
  const channel = client.channels.cache.get(PZ_NOTIFICATIONS_CHANNEL_ID);
  if (channel) {
    await channel.send(`🎮 **${playerName}** left the Creed PZ server. 🔴`);
  }
}

// Start monitoring the PZ server
function startPZMonitoring() {
  console.log('🎮 Starting Creed PZ server monitoring...');
  
  // Check immediately
  checkPZPlayers();
  
  // Then check every 30 seconds
  setInterval(checkPZPlayers, 30000);
}

// Respond to messages
client.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // Get the target channel
  const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID);

  // Greet with "hi"
  if (content === 'hi' || content === 'hello' || content === 'hey') {
    if (targetChannel) {
      targetChannel.send(`${message.author} said hi in ${message.channel}! 👋`);
    }
    message.reply('Hi there! 👋');
  }

  // Say "bye"
  if (content === 'bye' || content === 'goodbye' || content === 'see you') {
    if (targetChannel) {
      targetChannel.send(`${message.author} said bye in ${message.channel}! 👋`);
    }
    message.reply('Bye! See you later! 👋');
  }
  
  // Check who's online on PZ server
  if (content === '!players' || content === '!online') {
    if (onlinePlayers.size === 0) {
      message.reply('No players are currently online on the PZ server.');
    } else {
      const playerList = Array.from(onlinePlayers).join(', ');
      message.reply(`🎮 Players online (${onlinePlayers.size}): ${playerList}`);
    }
  }
});

// Welcome new members
client.on('guildMemberAdd', (member) => {
  const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID);
  if (targetChannel) {
    targetChannel.send(`Welcome to the server, ${member}! 🎉`);
  }
});

// Goodbye to leaving members
client.on('guildMemberRemove', (member) => {
  const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID);
  if (targetChannel) {
    targetChannel.send(`Goodbye, ${member.user.tag}! We'll miss you! 👋`);
  }
});

// Login with your bot token from environment variable
client.login(process.env.DISCORD_TOKEN);