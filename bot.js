
import { GoogleGenAI, Type } from "@google/genai";
import TelegramBot from 'node-telegram-bot-api';
import process from 'process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

// --- SERVER SETUP ---
const PORT = process.env.PORT || 3000;
const START_TIME = new Date().toLocaleString('en-US', { timeZone: 'UTC' });

const HTML_STATUS_PAGE = (uptime) => `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>BeeSenseBot Status</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; }
        .status { color: #16a34a; font-weight: bold; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <div class="card">
        <div class="status">✅ السيرفر يعمل بنشاط (Gemini 3 Mode)</div>
        <h1>BeeSenseBot - Ph.D. Edition</h1>
        <p>Expert Pathology Mode Active</p>
        <p>Started: ${uptime}</p>
    </div>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(HTML_STATUS_PAGE(START_TIME));
});

server.listen(PORT, () => {
  console.log(`🌐 Health check server listening on port ${PORT}`);
});

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
    console.error("❌ FATAL ERROR: TELEGRAM_TOKEN missing!");
    process.exit(1);
}

const DATASET_CHANNEL_ID = process.env.DATASET_CHANNEL_ID || "-1003359411043";

let API_KEYS = [
  process.env.API_KEY,
  process.env.API_KEY_1,
  process.env.API_KEY_2,
  process.env.API_KEY_3,
  process.env.API_KEY_4
].filter(key => key && key.trim().length > 10);

if (API_KEYS.length === 0) {
  console.error("❌ FATAL ERROR: No valid API Keys found!");
  process.exit(1);
}

let currentKeyIndex = 0;
const getAIClient = () => new GoogleGenAI({ apiKey: API_KEYS[currentKeyIndex] });

// Ensure dataset directory structure
const DATASET_DIR = path.join(process.cwd(), 'bee_dataset');
const IMAGES_DIR = path.join(DATASET_DIR, 'raw_images');
const DATA_FILE = path.join(DATASET_DIR, 'data.json');

[DATASET_DIR, IMAGES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- TELEGRAM BOT SETUP ---
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Graceful fix for 409 Conflict: Clear webhook before starting
bot.deleteWebHook().then(() => {
    console.log("✅ Connection cleared. Starting Gemini 3 Bot...");
    bot.startPolling({ interval: 1000, params: { timeout: 10 } });
});

// Handle Render Shutdown Signals
const stopBot = async (signal) => {
  console.log(`🛑 Received ${signal}. Stopping polling...`);
  await bot.stopPolling();
  server.close();
  process.exit(0);
};

process.once('SIGTERM', () => stopBot('SIGTERM'));
process.once('SIGINT', () => stopBot('SIGINT'));

bot.on('polling_error', (error) => {
  if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
    console.warn("⚠️ Conflict detected: Old instance is still closing...");
  } else {
    console.error(`[Polling Error] ${error.code}: ${error.message}`);
  }
});

// --- Ph.D. KNOWLEDGE BASE ---
const VETERINARY_KNOWLEDGE_BASE = `
⚠️ وضع الدكتوراه في علم أمراض النحل (Ph.D. Pathology Mode):
أنت الآن "بروفيسور في علم أمراض الحشرات" متخصص في تشخيص الأمراض والفيروسات عبر الصور.
الهدف: تحليل دقيق وشامل لأي علامات مرضية تظهر في الصورة.
`;

const diagnosisSchema = {
  type: Type.OBJECT,
  properties: {
    isBeeOrHive: { type: Type.BOOLEAN },
    conditionName: { type: Type.STRING },
    severity: { type: Type.STRING, enum: ["HEALTHY", "LOW", "MODERATE", "CRITICAL", "UNKNOWN"] },
    description: { type: Type.STRING },
    symptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendedTreatment: { type: Type.ARRAY, items: { type: Type.STRING } },
    preventativeMeasures: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["isBeeOrHive", "conditionName", "severity", "description", "symptoms", "recommendedTreatment", "preventativeMeasures"]
};

// --- HELPER FUNCTIONS ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const downloadImage = (url, filepath) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        res.pipe(fs.createWriteStream(filepath))
           .on('error', reject)
           .once('close', () => resolve(filepath));
      } else {
        res.resume();
        reject(new Error(`Failed: ${res.statusCode}`));
      }
    });
  });
};

// --- QUEUE SYSTEM ---
const requestQueue = [];
let isProcessingQueue = false;

const processQueue = async () => {
  if (isProcessingQueue || requestQueue.length === 0) return;
  isProcessingQueue = true;
  const { chatId, photoId } = requestQueue.shift();

  try {
    await handleImageAnalysis(chatId, photoId);
    await delay(500); 
  } catch (err) {
    console.error("Queue Error:", err);
  } finally {
    isProcessingQueue = false;
    processQueue();
  }
};

const addToQueue = (chatId, photoId) => {
  requestQueue.push({ chatId, photoId });
  processQueue();
};

async function handleImageAnalysis(chatId, photoId) {
  try {
    const fileLink = await bot.getFileLink(photoId);
    const timestamp = Date.now();
    const filename = `bee_${timestamp}.jpg`;
    const localFilePath = path.join(IMAGES_DIR, filename); 
    
    await downloadImage(fileLink, localFilePath);
    const base64Image = fs.readFileSync(localFilePath).toString('base64');

    let aiResult = null;
    let retries = 0;
    
    while (retries < API_KEYS.length * 2) {
      try {
        const ai = getAIClient(); 
        aiResult = await ai.models.generateContent({
          model: "gemini-3-flash-preview", // تم التحديث إلى المودل المطلوب
          contents: {
            parts: [
              { inlineData: { mimeType: "image/jpeg", data: base64Image } },
              { text: `Analyze as Ph.D. Pathologist. ${VETERINARY_KNOWLEDGE_BASE}. Output JSON Arabic.` }
            ]
          },
          config: { 
            responseMimeType: "application/json", 
            responseSchema: diagnosisSchema,
            temperature: 0.1
          }
        });
        break; 
      } catch (e) {
        console.log(`🔄 Switching key due to error: ${e.message}`);
        currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
        retries++;
        await delay(1000);
      }
    }

    if (!aiResult) throw new Error("All API keys failed.");

    const diagnosis = JSON.parse(aiResult.text);

    if (!diagnosis.isBeeOrHive) {
      return bot.sendMessage(chatId, "⚠️ لم يتم رصد نحل أو حضنة بشكل واضح في الصورة.");
    }

    const severityIcon = diagnosis.severity === "CRITICAL" ? "🔴" : diagnosis.severity === "HEALTHY" ? "🟢" : "🟠";

    let message = `🔬 *تقرير مختبر BeeSense (Gemini 3)*\n\n`;
    message += `🦠 *التشخيص:* ${diagnosis.conditionName}\n`;
    message += `${severityIcon} *الخطورة:* ${diagnosis.severity}\n\n`;
    message += `📝 *الوصف:* ${diagnosis.description}\n\n`;
    
    if (diagnosis.severity !== "HEALTHY") {
        message += `💊 *العلاج الموصى به:* \n${diagnosis.recommendedTreatment.map(t => `• ${t}`).join('\n')}\n\n`;
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ تشخيص دقيق", callback_data: `correct_${timestamp}` },
          { text: "❌ غير دقيق", callback_data: `wrong_${timestamp}` }
        ]]
      }
    });

    // Save record
    const record = { id: timestamp, filename, diagnosis, timestamp: new Date().toISOString() };
    let data = [];
    if (fs.existsSync(DATA_FILE)) data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data.push(record);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data.slice(-100), null, 2));

  } catch (error) {
    bot.sendMessage(chatId, "❌ حدث خطأ في النظام، يرجى المحاولة لاحقاً.");
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👨‍⚕️ *BeeSenseBot – خبير أمراض النحل (Ph.D. Gemini 3)*\n\nأرسل صورة للنحل ليتم تحليلها الآن.", {parse_mode: 'Markdown'});
});

bot.on('photo', (msg) => {
  addToQueue(msg.chat.id, msg.photo[msg.photo.length - 1].file_id);
});

bot.on('callback_query', async (query) => {
  await bot.answerCallbackQuery(query.id, { text: "شكراً لتقييمك!" });
  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: query.message.chat.id, message_id: query.message.message_id });
});
