import { GoogleGenAI, Type } from "@google/genai";
import TelegramBot from 'node-telegram-bot-api';
import process from 'process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

// --- SERVER SETUP FOR RENDER (CRITICAL) ---
const PORT = process.env.PORT || 3000;
const START_TIME = new Date().toLocaleString('en-US', { timeZone: 'UTC' });

// صفحة HTML لعرض حالة البوت ووقت التشغيل
const HTML_STATUS_PAGE = (uptime) => `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BeeSenseBot Status</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px; width: 90%; }
        .status { color: #16a34a; font-weight: bold; font-size: 1.25rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1rem; }
        .dot { width: 10px; height: 10px; background: #16a34a; border-radius: 50%; display: inline-block; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(22, 163, 74, 0); } 100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); } }
        h1 { color: #1e293b; margin: 0 0 0.5rem 0; }
        p { color: #64748b; line-height: 1.5; margin-bottom: 0.5rem; }
        .meta { font-size: 0.875rem; color: #94a3b8; background: #f1f5f9; padding: 0.5rem; border-radius: 0.5rem; margin-top: 1rem; }
    </style>
</head>
<body>
    <div class="card">
        <div class="status"><span class="dot"></span> السيرفر يعمل بنشاط</div>
        <h1>BeeSenseBot</h1>
        <p>بوت تيليجرام لتحليل أمراض النحل يعمل الآن 24/7.</p>
        <div class="meta">
            <div>Running on Render</div>
            <div>Started: ${START_TIME} UTC</div>
            <div>Keys Active: ${process.env.API_KEY_1 ? 'Environment Mode' : 'Direct Mode'}</div>
        </div>
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

// --- Configuration ---
const TELEGRAM_TOKEN = "8599719651:AAF2CdACTyjWJ1ACHDbeNz07PkceMLk0_14"; 

// 🔄 KEY ROTATION SYSTEM
// هام: يجب عليك وضع المفاتيح الجديدة هنا أو في إعدادات Render
// Google قام بحظر المفاتيح القديمة لأنها نُشرت للعامة
let API_KEYS = [
  process.env.API_KEY_1,
  process.env.API_KEY_2,
  process.env.API_KEY_3,
  process.env.API_KEY_4
].filter(key => key); // تصفية المفاتيح الفارغة

// إذا لم يتم العثور على مفاتيح في البيئة (للتجربة المحلية)، ضع مفاتيحك الجديدة هنا يدوياً
if (API_KEYS.length === 0) {
  API_KEYS = [
    "ضع_مفتاحك_الجديد_1_هنا",
    "ضع_مفتاحك_الجديد_2_هنا",
    "ضع_مفتاحك_الجديد_3_هنا",
    "ضع_مفتاحك_الجديد_4_هنا"
  ];
  console.log("⚠️ Using hardcoded keys. Ensure they are valid and not leaked.");
}

let currentKeyIndex = 0;

const getAIClient = () => {
  if (API_KEYS.length === 0 || API_KEYS[0].includes("ضع_مفتاحك")) {
    console.error("❌ ERROR: No valid API Keys found! Please add API_KEY_1, API_KEY_2... in Render Environment Variables.");
    throw new Error("Missing API Keys");
  }
  return new GoogleGenAI({ apiKey: API_KEYS[currentKeyIndex] });
};

// Ensure dataset directory structure
const DATASET_DIR = path.join(process.cwd(), 'bee_dataset');
const IMAGES_DIR = path.join(DATASET_DIR, 'raw_images');
const CORRECT_DIR = path.join(DATASET_DIR, 'verified_correct');
const WRONG_DIR = path.join(DATASET_DIR, 'verified_wrong');
const DATA_FILE = path.join(DATASET_DIR, 'data.json');

[DATASET_DIR, IMAGES_DIR, CORRECT_DIR, WRONG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize Bot
// إضافة خيارات Polling لتجنب تعارض النسخ (Conflict Error)
const bot = new TelegramBot(TELEGRAM_TOKEN, { 
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});

console.log("🐝 BeeSenseBot Telegram Bot is running...");
console.log(`🚀 Ultimate Mode: ${API_KEYS.length} API Keys Loaded.`);

// معالجة أخطاء Polling بذكاء
bot.on('polling_error', (error) => {
  if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
    console.log("⚠️ تنبيه: توجد نسخة أخرى من البوت تعمل (ربما Colab). يرجى إغلاقها ليعمل هذا البوت بنجاح.");
  } else {
    console.log(`Polling Error: ${error.code}`);
  }
});

// --- Knowledge Base ---
const VETERINARY_KNOWLEDGE_BASE = `
قواعد التشخيص البيطري للنحل:
1. **فاروا (Varroa Mites)**: حشرات حمراء/بنية بيضاوية. أجنحة مشوهة (DWV). خطورة: عالية.
2. **تعفن الحضنة الأمريكي (AFB)**: أغطية غائرة/مثقوبة، يرقات بنية لزجة (اختبار العود)، رائحة سمكية. خطورة: حرجة جداً (إعدام وحرق).
3. **تعفن الحضنة الأوروبي (EFB)**: يرقات ملتوية صفراء، غير مطاطية. خطورة: متوسطة/عالية.
4. **تكلس الحضنة (Chalkbrood)**: يرقات محنطة بيضاء/رمادية. خطورة: متوسطة.
5. **نوزيما (Nosema)**: انتفاخ البطن، إسهال على الإطارات. خطورة: عالية.
6. **خفساء الخلية (SHB)**: يرقات ديدان تخمر العسل. خطورة: عالية.
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
  required: ["isBeeOrHive", "conditionName", "severity", "description", "recommendedTreatment", "preventativeMeasures"]
};

// --- Helper Functions ---
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
        reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));
      }
    });
  });
};

const moveFile = (oldPath, newPath) => {
  try {
    fs.renameSync(oldPath, newPath);
    return true;
  } catch (err) {
    console.error("Error moving file:", err);
    return false;
  }
};

const saveToDataset = (record) => {
  let data = [];
  if (fs.existsSync(DATA_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) { console.error("Error reading data.json", e); }
  }
  const index = data.findIndex(d => d.id === record.id);
  if (index !== -1) {
    data[index] = { ...data[index], ...record };
  } else {
    data.push(record);
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// --- QUEUE SYSTEM ---
const requestQueue = [];
let isProcessingQueue = false;

const processQueue = async () => {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  isProcessingQueue = true;
  const { msg, chatId, photoId } = requestQueue.shift();

  try {
    if (requestQueue.length > 2) {
      bot.sendMessage(chatId, "⏳ وصل دورك! جاري تحليل الصورة...");
    }

    await handleImageAnalysis(chatId, photoId);
    
    // Fast throttle
    await delay(1000); 

  } catch (err) {
    console.error("Queue Error:", err);
    bot.sendMessage(chatId, "حدث خطأ غير متوقع.");
  } finally {
    isProcessingQueue = false;
    processQueue();
  }
};

const addToQueue = (msg, chatId, photoId) => {
  requestQueue.push({ msg, chatId, photoId });
  const position = requestQueue.length;
  
  if (position > 5) {
     bot.sendMessage(chatId, `🚦 أنت رقم ${position} في الطابور.`);
  } else if (position === 1) {
     bot.sendMessage(chatId, "جاري تحليل الصورة... 🔍");
  }
  processQueue();
};

async function handleImageAnalysis(chatId, photoId) {
  try {
    const fileLink = await bot.getFileLink(photoId);
    
    const timestamp = Date.now();
    const filename = `bee_${timestamp}.jpg`;
    const localFilePath = path.join(IMAGES_DIR, filename); 
    
    await downloadImage(fileLink, localFilePath);

    const imageBuffer = fs.readFileSync(localFilePath);
    const base64Image = imageBuffer.toString('base64');

    // 🔄 KEY ROTATION LOGIC
    let aiResult = null;
    let retries = 0;
    const maxRetries = 10; 
    
    while (retries < maxRetries) {
      try {
        const ai = getAIClient(); 
        
        aiResult = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: {
            parts: [
              { inlineData: { mimeType: "image/jpeg", data: base64Image } },
              { text: `حلل الصورة بيطرياً. ${VETERINARY_KNOWLEDGE_BASE}. Output JSON Arabic.` }
            ]
          },
          config: { 
            responseMimeType: "application/json", 
            responseSchema: diagnosisSchema 
          }
        });
        break; 
      } catch (e) {
        if (e.message.includes("429") || e.message.includes("Quota")) {
          console.log(`⚠️ Key #${currentKeyIndex + 1} Exhausted. Switching...`);
          currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
          console.log(`✅ Using Key #${currentKeyIndex + 1}`);
          retries++;
        } else if (e.message.includes("403") || e.message.includes("leaked")) {
           console.error(`❌ Key #${currentKeyIndex + 1} REVOKED/LEAKED. Switching...`);
           // Remove bad key logic could go here, but for now just switch
           currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
           retries++;
        } else {
          throw e; 
        }
      }
    }

    if (!aiResult) throw new Error("Failed after trying all keys.");

    const diagnosis = JSON.parse(aiResult.text);

    const record = {
      id: timestamp, filename: filename, current_path: localFilePath,
      diagnosis: diagnosis, user_feedback: "pending", timestamp: new Date().toISOString()
    };
    saveToDataset(record);

    if (!diagnosis.isBeeOrHive) {
      await bot.sendMessage(chatId, "⚠️ لم أتعرف على نحل أو خلية في الصورة.");
      return;
    }

    const treatments = diagnosis.recommendedTreatment || [];
    const treatmentText = Array.isArray(treatments) 
      ? treatments.map(t => `• ${t}`).join('\n') 
      : treatments;

    const preventions = diagnosis.preventativeMeasures || [];
    const preventionText = Array.isArray(preventions) 
      ? preventions.map(p => `• ${p}`).join('\n') 
      : preventions;

    const severityIcon = diagnosis.severity === "CRITICAL" ? "🔴" : diagnosis.severity === "HEALTHY" ? "🟢" : "🟠";

    let message = `🔬 *تقرير الفحص البيطري*\n`;
    message += `🦠 *التشخيص:* ${diagnosis.conditionName}\n`;
    message += `${severityIcon} *الخطورة:* ${diagnosis.severity}\n\n`;
    message += `📝 *التحليل:* ${diagnosis.description}\n\n`;
    message += `💊 *العلاج:* \n${treatmentText}\n\n`;
    if (preventionText) {
      message += `🛡️ *وقاية المنحل:* \n${preventionText}\n\n`;
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

  } catch (error) {
    console.error("Analysis Error:", error);
    if (error.message.includes("Missing API Keys")) {
         bot.sendMessage(chatId, "❌ خطأ في الإعدادات: يرجى تحديث مفاتيح API في لوحة التحكم (Render Environment Variables).");
    } else {
         bot.sendMessage(chatId, "❌ نعتذر، حدث خطأ تقني. حاول مرة أخرى.");
    }
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "مرحباً! 🐝\nأنا BeeSenseBot.\nأرسل صورة للنحل للحصول على تقرير بيطري شامل.");
});

bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const photoId = msg.photo[msg.photo.length - 1].file_id;
  addToQueue(msg, chatId, photoId);
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const [action, id] = query.data.split('_');
  const timestampId = parseInt(id);

  if (fs.existsSync(DATA_FILE)) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const index = data.findIndex(d => d.id === timestampId);
    
    if (index !== -1) {
      const record = data[index];
      const oldPath = record.current_path;
      const filename = record.filename;
      
      let newDir = action === "correct" ? CORRECT_DIR : WRONG_DIR;
      let newPath = path.join(newDir, filename);

      if (fs.existsSync(oldPath)) {
        moveFile(oldPath, newPath);
        data[index].user_feedback = action;
        data[index].current_path = newPath;
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

        const replyText = action === "correct" ? `✅ شكراً! تم تأكيد التشخيص.` : `📝 شكراً لتنبيهنا، سنراجع الحالة.`;
        bot.answerCallbackQuery(query.id, { text: "تم" });
        bot.sendMessage(chatId, replyText);
      }
    }
  }
});
