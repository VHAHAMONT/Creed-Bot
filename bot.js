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

// When the bot is ready
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Your specific channel ID
const TARGET_CHANNEL_ID = '1440307136872845354';

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

// Login with your bot token
client.login('MTQ0OTgwMDQ4NDM5NDM3MzI3Mg.Gy6E83.BfHr04N3uLdaCOeW_QqenqeZFYoDf3fw9kMrFQ');