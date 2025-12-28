const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: '.wwebjs_auth'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

let isReady = false;

// QR Code for authentication
client.on('qr', (qr) => {
  console.log('🔐 Scan this QR code with your WhatsApp:');
  qrcode.generate(qr, { small: true });
  console.log('\nOr visit: http://localhost:' + (process.env.PORT || 3001) + '/qr');
});

client.on('ready', () => {
  console.log('✅ WhatsApp Bot is ready!');
  isReady = true;
  startSlotMonitoring();
});

client.on('authenticated', () => {
  console.log('✅ Authenticated');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Disconnected:', reason);
  isReady = false;
});

client.initialize();

// Send message to group
async function sendGroupMessage(message) {
  if (!isReady) {
    console.log('⚠️ WhatsApp not ready yet');
    return false;
  }

  try {
    const groupId = process.env.WHATSAPP_GROUP_ID;
    if (!groupId) {
      console.error('❌ WHATSAPP_GROUP_ID not set');
      return false;
    }
    
    await client.sendMessage(groupId, message);
    console.log('✅ Message sent to group');
    return true;
  } catch (error) {
    console.error('❌ Error sending message:', error);
    return false;
  }
}

// Webhook for new slot
app.post('/webhook/new-slot', async (req, res) => {
  try {
    const { slot_id } = req.body;

    const { data: slot, error } = await supabase
      .from('slots')
      .select('*')
      .eq('id', slot_id)
      .single();

    if (error || !slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    const time = new Date(slot.start_time).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const message = `🎮 *ETHICAL FIRE - NEW SLOT!* 🔥

⏰ *Time:* ${time}
👤 *Created by:* ${slot.creator_name}

📝 *Players:*
1️⃣ ${slot.player1 || '—'}
2️⃣ ${slot.player2 || '—'}
3️⃣ ${slot.player3 || '—'}
4️⃣ ${slot.player4 || '—'}

Join now! 🚀`;

    const success = await sendGroupMessage(message);
    res.json({ success });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Monitor slots for reminders
async function startSlotMonitoring() {
  console.log('🔍 Starting slot monitoring...');
  
  setInterval(async () => {
    try {
      const now = new Date();
      const in15min = new Date(now.getTime() + 15 * 60000);

      const { data: slots, error } = await supabase
        .from('slots')
        .select('*')
        .eq('status', 'active')
        .eq('notification_sent', false)
        .gte('start_time', now.toISOString())
        .lte('start_time', in15min.toISOString());

      if (error) {
        console.error('Error fetching slots:', error);
        return;
      }

      for (const slot of slots || []) {
        const players = [slot.player1, slot.player2, slot.player3, slot.player4]
          .filter(p => p && p.trim() !== '');

        const time = new Date(slot.start_time).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        let message = `⏰ *SLOT REMINDER!* 🎮

Your BGMI slot starts at *${time}* (in 15 min)

📝 *Squad:*
${players.map((p, i) => `${i + 1}️⃣ ${p}`).join('\n')}`;

        // Add comments
        if (slot.player1_comment) message += `\n\n💬 ${slot.player1}: ${slot.player1_comment}`;
        if (slot.player2_comment) message += `\n💬 ${slot.player2}: ${slot.player2_comment}`;
        if (slot.player3_comment) message += `\n💬 ${slot.player3}: ${slot.player3_comment}`;
        if (slot.player4_comment) message += `\n💬 ${slot.player4}: ${slot.player4_comment}`;

        message += `\n\n*GET READY!* 🔥`;

        await sendGroupMessage(message);

        // Mark as notified
        await supabase
          .from('slots')
          .update({ notification_sent: true })
          .eq('id', slot.id);

        console.log(`✅ Sent reminder for slot at ${time}`);
      }
    } catch (error) {
      console.error('Monitoring error:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    whatsapp_ready: isReady,
    timestamp: new Date().toISOString()
  });
});

// Get groups (helper)
app.get('/get-groups', async (req, res) => {
  try {
    if (!isReady) {
      return res.status(503).json({ error: 'WhatsApp not ready' });
    }
    
    const chats = await client.getChats();
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(chat => ({
        name: chat.name,
        id: chat.id._serialized
      }));
    
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
