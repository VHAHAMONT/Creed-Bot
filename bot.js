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

// Create a new Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Your specific channel ID
const TARGET_CHANNEL_ID = '1440307136872845354';

// When the bot is ready
client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
});

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