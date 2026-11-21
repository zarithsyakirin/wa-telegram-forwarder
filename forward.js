require('dotenv').config();
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const MY_CHAT = String(process.env.TELEGRAM_CHAT_ID);
const API = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

// ---------- settings (saved in settings.json) ----------
const SETTINGS_FILE = 'settings.json';
const defaults = { watchChatId: process.env.WA_CHAT_ID || '', recentCount: 2, meetOnly: false };
let settings = { ...defaults };
try {
  settings = { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
} catch {}
function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// ---------- telegram helpers ----------
async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendTelegram(text) {
  const data = await tg('sendMessage', { chat_id: MY_CHAT, text });
  if (!data.ok) console.log('Telegram error:', data);
}

// ---------- whatsapp ----------
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  },
});

async function forward(msg) {
  const contact = await msg.getContact();
  const sender = contact.pushname || contact.number;
  await sendTelegram(`${sender}: ${msg.body}`);
}

function shouldForward(msg) {
  if (settings.meetOnly && !msg.body.includes('meet.google.com')) return false;
  return true;
}

async function sendRecent() {
  if (!settings.watchChatId || settings.recentCount < 1) return;
  const chat = await client.getChatById(settings.watchChatId);
  const recent = await chat.fetchMessages({ limit: settings.recentCount });
  await sendTelegram('--- Recent messages ---');
  for (const msg of recent) {
    if (shouldForward(msg)) await forward(msg);
  }
  await sendTelegram('--- Live from now ---');
}

// ---------- telegram commands ----------
let lastList = [];

async function handleCommand(text) {
  const [first, ...rest] = text.split(' ');
  const cmd = first.split('@')[0].toLowerCase();
  const arg = rest.join(' ').trim();

  switch (cmd) {
    case '/chats': {
      const chats = await client.getChats();
      lastList = chats
        .filter((c) => !arg || (c.name || '').toLowerCase().includes(arg.toLowerCase()))
        .slice(0, 15);
      if (!lastList.length) return sendTelegram('No chats found.');
      const lines = lastList.map((c, i) => `${i + 1}. ${c.name || '(no name)'}${c.isGroup ? ' (group)' : ''}`);
      return sendTelegram(lines.join('\n') + '\n\nUse /watch <number> to pick one.');
    }

    case '/watch': {
      if (!arg) return sendTelegram('Usage: /watch <number from /chats> or part of a chat name');
      let chat;
      if (/^\d+$/.test(arg) && lastList[Number(arg) - 1]) {
        chat = lastList[Number(arg) - 1];
      } else {
        const all = await client.getChats();
        chat = all.find((c) => (c.name || '').toLowerCase().includes(arg.toLowerCase()));
      }
      if (!chat) return sendTelegram('Could not find that chat. Try /chats first.');
      settings.watchChatId = chat.id._serialized;
      saveSettings();
      return sendTelegram(`Now watching: ${chat.name}`);
    }

    case '/status': {
      let name = '(none)';
      if (settings.watchChatId) {
        try {
          name = (await client.getChatById(settings.watchChatId)).name;
        } catch {
          name = settings.watchChatId;
        }
      }
      return sendTelegram(
        `Watching: ${name}\nRecent messages on start: ${settings.recentCount}\nMeet links only: ${settings.meetOnly ? 'on' : 'off'}`
      );
    }

    case '/recent':
      return sendRecent();

    case '/count': {
      const n = Number(arg);
      if (!Number.isInteger(n) || n < 0 || n > 10) return sendTelegram('Usage: /count <0-10>');
      settings.recentCount = n;
      saveSettings();
      return sendTelegram(`Will send the last ${n} messages on startup.`);
    }

    case '/meetonly': {
      if (arg !== 'on' && arg !== 'off') return sendTelegram('Usage: /meetonly on  or  /meetonly off');
      settings.meetOnly = arg === 'on';
      saveSettings();
      return sendTelegram(`Meet links only: ${arg}`);
    }

    default:
      return sendTelegram(
        'Commands:\n/chats [search]\n/watch <number or name>\n/status\n/recent\n/count <0-10>\n/meetonly on|off'
      );
  }
}

async function pollTelegram() {
  let offset = 0;
  try {
    // skip any old commands that piled up while the bot was off
    const old = await (await fetch(`${API}/getUpdates?offset=-1`)).json();
    if (old.result && old.result.length) offset = old.result[old.result.length - 1].update_id + 1;
  } catch {}

  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();
      for (const update of data.result || []) {
        offset = update.update_id + 1;
        const m = update.message;
        if (!m || !m.text || !m.text.startsWith('/')) continue;
        if (String(m.chat.id) !== MY_CHAT) continue; // only obey you
        try {
          await handleCommand(m.text.trim());
        } catch (err) {
          await sendTelegram('Error: ' + err.message);
        }
      }
    } catch (err) {
      console.log('Poll error:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// ---------- start ----------
let started = false;

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));

client.on('ready', async () => {
  console.log('Watching for messages...');
  if (started) return;
  started = true;

  tg('setMyCommands', {
    commands: [
      { command: 'chats', description: 'List WhatsApp chats' },
      { command: 'watch', description: 'Pick the chat to watch' },
      { command: 'status', description: 'Show current settings' },
      { command: 'recent', description: 'Send recent messages now' },
      { command: 'count', description: 'Recent messages on startup' },
      { command: 'meetonly', description: 'Only forward Meet links' },
    ],
  });
  pollTelegram();

  try {
    await sendRecent();
    console.log('Sent recent messages');
  } catch (err) {
    console.log('Could not fetch recent messages:', err.message);
  }
});

client.on('message_create', async (msg) => {
  const chatId = msg.fromMe ? msg.to : msg.from;
  if (!settings.watchChatId || chatId !== settings.watchChatId) return;
  if (!shouldForward(msg)) return;

  await forward(msg);
  console.log('Forwarded a message');
});

client.initialize();