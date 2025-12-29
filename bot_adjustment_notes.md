# Discord Bot - Adjustment Notes & Implementation Guide

## 🔴 CRITICAL CHANGES (Must Do Immediately)

### 1. Environment Variables Setup
**REMOVED hardcoded credentials** - You must now set these environment variables:

```env
# Required Variables
DISCORD_TOKEN=your_discord_bot_token_here
PZ_SERVER_IP=74.63.203.35
PZ_RCON_PORT=27015
PZ_RCON_PASSWORD=zombi123creed

# Optional Variables
TARGET_CHANNEL_ID=1440307136872845354
PZ_NOTIFICATIONS_CHANNEL_ID=1450141778211766394
ADMIN_ROLE_ID=your_admin_role_id
RESTART_SCHEDULE=0 0 */8 * * *
PORT=3000
```

**How to set these:**
- **Render.com**: Go to your service → Environment → Add each variable
- **Local development**: Create a `.env` file in your project root
- **Other hosting**: Check your platform's documentation for environment variables

### 2. Install dotenv Package (for local development)
```bash
npm install dotenv
```

Add to the very top of bot.js (for local development):
```javascript
require('dotenv').config();
```

**Note:** Render.com doesn't need dotenv as it injects environment variables directly.

---

## ✅ MAJOR IMPROVEMENTS ADDED

### Security Enhancements

1. **Removed Hardcoded Credentials**
   - Bot now requires environment variables
   - Will exit with error message if variables are missing
   - Prevents accidental credential exposure

2. **Input Sanitization**
   - `sanitizeMessage()` function prevents RCON injection attacks
   - Removes quotes, backslashes, and non-printable characters
   - Limits message length to 200 characters

3. **Command Rate Limiting**
   - Prevents command spam
   - Configurable cooldowns per command
   - Default: restart=60s, announce=10s, players=5s

### Reliability Improvements

1. **RCON Connection Pool**
   - Maintains persistent RCON connection
   - Auto-reconnection on failure
   - Retry logic (3 attempts) for failed commands
   - Better error handling

2. **Enhanced Error Handling**
   - Try-catch blocks on all event handlers
   - Graceful error messages to users
   - Detailed error logging
   - Process error handlers (unhandledRejection, uncaughtException)

3. **Memory Leak Prevention**
   - `playerMessageHistory` now includes timestamps
   - Automatic cleanup of old entries every 30 minutes
   - Prevents unbounded memory growth

### Logging & Monitoring

1. **Enhanced Logging System**
   - Timestamps on all log entries
   - Log levels: INFO, WARN, ERROR, DEBUG
   - Structured log format: `[timestamp] [level] message`

2. **Better Health Endpoint**
   ```
   GET /health
   Returns: {
     status: 'ok',
     uptime: 12345,
     onlinePlayers: 3,
     restartInProgress: false
   }
   ```

### User Experience

1. **Improved Help Command**
   - Cleaner formatting
   - Categorized commands
   - Mentions cooldown system

2. **Better Error Messages**
   - More informative feedback
   - Cooldown time remaining shown
   - Clear permission denial messages

3. **Command Validation**
   - Empty announcement check
   - Better permission checking
   - Duplicate restart prevention

---

## 📋 IMPORTANT NOTES

### Server Restart Behavior
⚠️ **CRITICAL**: The `!restart` command uses `quit` which **shuts down** the server, it does NOT automatically restart it.

**You need ONE of these solutions:**

1. **Docker** (recommended):
   ```yaml
   restart: always
   ```

2. **systemd service**:
   ```ini
   [Service]
   Restart=always
   RestartSec=10
   ```

3. **PM2**:
   ```bash
   pm2 start your_server --restart-delay=10000
   ```

4. **Hosting panel**: Enable "Auto-restart on crash" in your hosting control panel (like qPanel, TCAdmin, etc.)

### Cron Schedule Format
```
┌─────────── second (0-59)
│ ┌───────── minute (0-59)
│ │ ┌─────── hour (0-23)
│ │ │ ┌───── day of month (1-31)
│ │ │ │ ┌─── month (1-12)
│ │ │ │ │ ┌─ day of week (0-6, Sunday=0)
│ │ │ │ │ │
* * * * * *
```

Examples:
- `0 0 */8 * * *` - Every 8 hours (12am, 8am, 4pm)
- `0 0 3 * * *` - Daily at 3 AM
- `0 0 */6 * * *` - Every 6 hours
- `0 0 0,12 * * *` - Twice daily (midnight and noon)

---

## 🚀 DEPLOYMENT STEPS

### For Existing Bot (Update)

1. **Backup your current bot.js**
   ```bash
   cp bot.js bot.js.backup
   ```

2. **Replace bot.js** with the new version

3. **Set environment variables** in your hosting platform

4. **Test locally first** (if possible):
   ```bash
   npm install dotenv
   # Create .env file with your variables
   node bot.js
   ```

5. **Deploy to Render**:
   - Commit and push changes
   - Go to Render dashboard → Environment
   - Add all required environment variables
   - Manually deploy or trigger auto-deploy

6. **Verify functionality**:
   - Check logs for "✅ Logged in as..."
   - Test `!help` command
   - Test `!players` command
   - Check `/health` endpoint

### For New Bot

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**

3. **Test locally** (optional):
   ```bash
   npm start
   ```

4. **Deploy to Render**

---

## 🐛 TROUBLESHOOTING

### "Missing required environment variables"
- Check all required variables are set in your hosting platform
- Verify no typos in variable names
- For Render: Environment → Add variable → Save → Manual Deploy

### "Failed to connect to RCON"
- Verify PZ_SERVER_IP, PZ_RCON_PORT, PZ_RCON_PASSWORD are correct
- Check if RCON is enabled on your PZ server
- Verify firewall allows RCON port
- Test RCON connection with another tool

### "Commands not responding"
- Check bot has proper Discord permissions
- Verify channel IDs are correct
- Check bot is online in Discord server
- Review logs for errors

### "Restart doesn't work"
- Ensure external restart mechanism is configured (see Server Restart Behavior above)
- Check RCON connection is working (`!testrcon`)
- Verify admin permissions

### Memory issues
- Monitor `/health` endpoint for `onlinePlayers` count
- Check logs for cleanup messages
- Consider lowering cleanup interval if needed

---

## 📊 MONITORING

### Check Bot Status
```
GET https://your-bot.onrender.com/health
```

### Key Metrics to Monitor
- Uptime
- Online players count
- Restart progress status
- Server response time

### Log Messages to Watch For
- ✅ Success messages
- ⚠️ Warning messages
- ❌ Error messages
- 🔄 Restart sequences

---

## 🔒 SECURITY BEST PRACTICES

1. **Never commit `.env` file** to git:
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Rotate credentials** periodically:
   - RCON password
   - Discord bot token

3. **Use admin role** instead of general admin permissions:
   - Create specific bot admin role
   - Set ADMIN_ROLE_ID environment variable

4. **Monitor bot logs** for suspicious activity

5. **Keep dependencies updated**:
   ```bash
   npm audit
   npm update
   ```

---

## 📝 OPTIONAL ENHANCEMENTS

### Add More Commands
```javascript
if (content === '!status') {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  await message.reply(`Bot uptime: ${hours}h ${minutes}m`);
}
```

### Custom Restart Schedule
Set `RESTART_SCHEDULE` environment variable:
```
0 0 4 * * * (Daily at 4 AM)
0 0 */6 * * * (Every 6 hours)
```

### Add More Notification Channels
Modify channel IDs in environment variables for different announcement channels.

---

## 📞 SUPPORT

If you encounter issues:
1. Check logs in Render dashboard
2. Verify all environment variables
3. Test RCON connection separately
4. Ensure server has auto-restart enabled
5. Review Discord bot permissions

**Common Issues Reference:**
- Connection timeouts → Check firewall/RCON settings
- Permission denied → Verify admin role setup
- Commands ignored → Check channel IDs
- Restart fails → Ensure external restart mechanism exists