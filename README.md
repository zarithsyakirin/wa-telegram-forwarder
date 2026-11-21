# WhatsApp → Telegram Forwarder

A small Node.js bot that watches one WhatsApp chat and forwards every new message to your Telegram DM. You control it from Telegram with slash commands, so there's no need to edit files or restart it to change settings.

I built it because I get Google Meet links in WhatsApp groups but don't want to run the WhatsApp desktop app on my laptop. Telegram is already open, so the links show up there instead.

## Features

- Forwards messages from one chosen WhatsApp chat (group or DM) to Telegram in real time
- Switch the watched chat from Telegram with `/chats` and `/watch`, no restart needed
- Optionally forward only messages containing a Google Meet link
- Sends the last few messages on startup, in case a link was posted before the bot started
- Settings are saved to `settings.json` and survive restarts
- Only obeys commands from your own Telegram chat
- Optional Windows auto-start with automatic restart if it crashes

## How it works

```
WhatsApp group  ──►  whatsapp-web.js (linked device)  ──►  forward.js  ──►  Telegram Bot API  ──►  your Telegram DM
                                                              ▲
                                                              └── commands from you (long polling)
```

- **WhatsApp side:** [`whatsapp-web.js`](https://github.com/pedroslopez/whatsapp-web.js) logs in as a linked device (like WhatsApp Web) and fires an event for every message.
- **Telegram side:** plain `fetch` calls to the Telegram Bot API. `sendMessage` sends forwards and replies, and `getUpdates` (long polling) listens for your commands.
- **Settings:** stored in `settings.json`, which the bot reads on startup and updates when you use a command.

## Requirements

- [Node.js](https://nodejs.org) (LTS version, 18 or newer, since the bot uses the built-in `fetch`)
- A Telegram account
- A WhatsApp account on your phone
- Microsoft Edge or Google Chrome installed (used as a hidden browser by `whatsapp-web.js`)

## Setup

### 1. Create a Telegram bot

1. In Telegram, open [@BotFather](https://t.me/BotFather) and send `/newbot`.
2. Follow the prompts and copy the **bot token** it gives you.
3. Open your new bot and press **Start**, then send it any message.
4. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and find `"chat":{"id": ...` in the response. That number is your **chat ID**.

### 2. Install

```
git clone https://github.com/zarithsyakirin/wa-telegram-forwarder.git
cd wa-telegram-forwarder
npm install
```

### 3. Configure

Copy `.env.example` to `.env` and fill in your values:

```
TELEGRAM_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
WA_CHAT_ID=optional_default_chat_id
```

`WA_CHAT_ID` is optional. You can pick the chat later with `/watch`.

### 4. Set the browser path

In `forward.js`, check that `executablePath` points to a browser that exists on your machine. The default is Microsoft Edge on Windows:

```js
executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
```

If you use Chrome, change it to your `chrome.exe` path.

### 5. Run

```
node forward.js
```

The first run prints a QR code in the terminal. On your phone, open WhatsApp → **Settings → Linked devices → Link a device** and scan it. The first sync can take a few minutes on a slow connection. After that, the session is saved and you won't need to scan again.

When you see `Watching for messages...`, the bot is live.

## Commands

Send these to your bot in Telegram:

| Command | What it does |
| --- | --- |
| `/chats [search]` | Lists your WhatsApp chats. Add a word to filter by name, e.g. `/chats uni` |
| `/watch <number or name>` | Picks the chat to watch, using a number from `/chats` or part of the chat name |
| `/status` | Shows the watched chat and current settings |
| `/recent` | Sends the last few messages from the watched chat right now |
| `/count <0-10>` | Sets how many recent messages are sent on startup |
| `/meetonly on\|off` | Forwards only messages containing `meet.google.com` |

## Auto-start on Windows (optional)

`start-forwarder.bat` runs the bot and restarts it 15 seconds after a crash.

1. Double-click `start-forwarder.bat` once to test it.
2. Press `Win+R`, type `shell:startup`, and press Enter.
3. Create a **shortcut** to `start-forwarder.bat` in that folder (a shortcut, not a copy of the file).
4. Right-click the shortcut → **Properties** → set **Run** to **Minimized**.

To stop the bot, close its window. Run only one copy at a time, because two copies would fight over the same WhatsApp session.

## Project layout

```
forward.js              the bot
start-forwarder.bat     Windows launcher with auto-restart
.env.example            template for your secrets
settings.json           created automatically when you change a setting
```

## Security notes

- **Never commit `.env`, `.wwebjs_auth`, or `settings.json`.** They hold your bot token and your WhatsApp login session, and they're already in `.gitignore`.
- If your bot token leaks, send `/revoke` to @BotFather to get a new one.
- The bot ignores commands from any Telegram chat other than the one in `TELEGRAM_CHAT_ID`.

## Troubleshooting

- **`npm` is blocked in PowerShell ("running scripts is disabled"):** run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use Command Prompt instead.
- **"Could not find Chrome":** the bundled Chrome download can get removed by antivirus. Point `executablePath` at your installed Edge or Chrome instead (see step 4).
- **Chat list is empty or slow right after first login:** WhatsApp is still syncing history to the linked device. Wait for the phone to finish syncing.
- **Bot works but commands do nothing:** make sure the script is running, and don't open the `getUpdates` link in a browser while it is, since that can steal the commands.

## Disclaimer

This project uses [`whatsapp-web.js`](https://github.com/pedroslopez/whatsapp-web.js), an **unofficial** library. It isn't affiliated with or endorsed by WhatsApp, and WhatsApp's terms don't allow automated clients, so there is a small risk of your number being restricted. This bot only reads and forwards messages, which keeps that risk low, but use it at your own risk and for personal use only.

## License

MIT
