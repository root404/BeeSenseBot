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
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8599719651:AAF2CdACTyjWJ1ACHDbeNz07PkceMLk0_14"; 

// معرف القناة الخاصة لتخزين البيانات (BeeSense Dataset)
const DATASET_CHANNEL_ID = process.env.DATASET_CHANNEL_ID || "-1003359411043";

// 🔄 KEY ROTATION SYSTEM
let API_KEYS = [
  process.env.API_KEY_1,
  process.env.API_KEY_2,
  process.env.API_KEY_3,
  process.env.API_KEY_4
].filter(key => key);

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
const DATA_FILE = path.join(DATASET_DIR, 'data.json');

[DATASET_DIR, IMAGES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize Bot
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
console.log(`📂 Cloud Archiving Active: Channel ${DATASET_CHANNEL_ID}`);

bot.on('polling_error', (error) => {
  if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
    console.log("⚠️ تنبيه: توجد نسخة أخرى من البوت تعمل (ربما Colab). يرجى إغلاقها ليعمل هذا البوت بنجاح.");
  } else if (error.code === 'ETELEGRAM' && error.message.includes('401 Unauthorized')) {
    console.log("❌ خطأ: التوكن غير صالح. يرجى تحديث TELEGRAM_TOKEN في إعدادات Render.");
  } else {
    console.log(`Polling Error: ${error.code}`);
  }
});

// --- Knowledge Base ---
const VETERINARY_KNOWLEDGE_BASE = `
أنت خبير عالمي في تربية النحل ومفتش مناحل.
قواعد الفحص الشامل:
1. **الملكة (Queen)**: ابحث عن نحلة طويلة البطن، أو علامات وجودها (بيض جديد عمودي في العيون).
2. **الحضنة (Brood)**:
   - **السليمة**: متراصة (Compact)، أغطية محدبة قليلاً بلون بني فاتح/أصفر، يرقات لؤلؤية بيضاء.
   - **المريضة**: مثقوبة، غائرة، "طلقات خرطوش" (Spotty)، يرقات ملونة.
3. **المخزون**:
   - **عسل**: عيون مختومة بشمع أبيض/شفاف.
   - **خبز النحل/حبوب اللقاح**: ألوان متعددة (أصفر، برتقالي) داخل العيون.
4. **الأمراض (Diseases)**:
   - **فاروا**: حشرات حمراء على النحل.
   - **AFB**: أغطية مثقوبة، رائحة (افتراضية)، يرقات لزجة.
   - **EFB**: يرقات ملتوية صفراء.
   - **تكييس/تكلس**: يرقات محنطة.
   - **عث الشمع**: خيوط عنكبوتية.

قيم حالة الخلية العامة: (قوية، متوسطة، ضعيفة) بناءً على كثافة النحل وانتظام الحضنة.
`;

const diagnosisSchema = {
  type: Type.OBJECT,
  properties: {
    isBeeOrHive: { type: Type.BOOLEAN },
    hiveCondition: { type: Type.STRING, enum: ["STRONG", "MODERATE", "WEAK", "UNKNOWN"], description: "Overall colony strength based on bee density and brood pattern." },
    visualDetections: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING }, 
      description: "List of items seen: e.g., 'Queen', 'Eggs', 'Capped Brood', 'Honey', 'Pollen', 'Varroa Mites'." 
    },
    conditionName: { type: Type.STRING },
    severity: { type: Type.STRING, enum: ["HEALTHY", "LOW", "MODERATE", "CRITICAL", "UNKNOWN"] },
    description: { type: Type.STRING },
    recommendedTreatment: { type: Type.ARRAY, items: { type: Type.STRING } },
    preventativeMeasures: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["isBeeOrHive", "hiveCondition", "visualDetections", "conditionName", "severity", "description", "recommendedTreatment", "preventativeMeasures"]
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
              { text: `حلل الصورة كمفتش مناحل شامل. ${VETERINARY_KNOWLEDGE_BASE}. Output JSON Arabic.` }
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

    // بناء التقرير
    const treatments = diagnosis.recommendedTreatment || [];
    const treatmentText = Array.isArray(treatments) ? treatments.map(t => `• ${t}`).join('\n') : treatments;

    const preventions = diagnosis.preventativeMeasures || [];
    const preventionText = Array.isArray(preventions) ? preventions.map(p => `• ${p}`).join('\n') : preventions;
    
    const detections = diagnosis.visualDetections || [];
    const detectionsText = detections.length > 0 ? detections.join('، ') : "لا يوجد مشاهدات خاصة";

    const severityIcon = diagnosis.severity === "CRITICAL" ? "🔴" : diagnosis.severity === "HEALTHY" ? "🟢" : "🟠";
    const conditionText = diagnosis.hiveCondition === "STRONG" ? "قوية 💪" : diagnosis.hiveCondition === "WEAK" ? "ضعيفة 🥀" : "متوسطة ⚖️";

    let message = `🔬 *تقرير مفتش المناحل*\n`;
    message += `📊 *حالة الخلية:* ${conditionText}\n`;
    message += `👁️ *المشاهدات:* ${detectionsText}\n\n`;
    
    message += `🦠 *التشخيص:* ${diagnosis.conditionName}\n`;
    message += `${severityIcon} *الخطورة:* ${diagnosis.severity}\n\n`;
    message += `📝 *التحليل:* ${diagnosis.description}\n\n`;
    
    if (diagnosis.severity !== "HEALTHY") {
        message += `💊 *العلاج:* \n${treatmentText}\n\n`;
        message += `🛡️ *وقاية المنحل:* \n${preventionText}\n\n`;
    } else {
        message += `💡 *نصيحة:* \n${treatmentText}\n\n`;
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
    bot.sendMessage(chatId, "❌ نعتذر، حدث خطأ تقني. حاول مرة أخرى.");
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

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const [action, id] = query.data.split('_');
  const timestampId = parseInt(id);

  // إخفاء الأزرار فوراً لمنع التكرار
  try {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: chatId,
      message_id: query.message.message_id
    });
  } catch (e) {
    console.log("Error removing markup (message likely old):", e.message);
  }

  if (fs.existsSync(DATA_FILE)) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const index = data.findIndex(d => d.id === timestampId);
    
    if (index !== -1) {
      const record = data[index];
      const localPath = record.current_path;
      
      data[index].user_feedback = action;
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

      await bot.answerCallbackQuery(query.id, { text: "تم تسجيل ردك" });
      
      if (action === "correct") {
         await bot.sendMessage(chatId, `✅ شكراً! تم تأكيد التشخيص وحفظ الصورة في قاعدة البيانات.`);
         
         // --- CLOUD ARCHIVING TO CHANNEL ---
         if (fs.existsSync(localPath)) {
             try {
                 const caption = `📁 #Confirmed_Data\n` +
                                 `🦠 Disease: ${record.diagnosis.conditionName}\n` +
                                 `⚖️ Condition: ${record.diagnosis.hiveCondition}\n` +
                                 `⚠️ Severity: ${record.diagnosis.severity}\n` +
                                 `📝 Desc: ${record.diagnosis.description.substring(0, 100)}...\n\n` +
                                 `🛠 JSON Data:\n` +
                                 `${JSON.stringify(record.diagnosis)}`;

                 const fileStream = fs.createReadStream(localPath);
                 
                 // Sending to the Dataset Channel
                 await bot.sendPhoto(DATASET_CHANNEL_ID, fileStream, { 
                     caption: caption.substring(0, 1024) // Telegram limits caption to 1024 chars
                 });
                 console.log("✅ Image archived to Telegram Channel successfully.");
                 
             } catch (err) {
                 console.error("❌ Failed to archive to channel:", err.message);
                 // Don't fail the user interaction, just log server side
             }
         } else {
             console.log("⚠️ File expired or deleted before archiving.");
         }
      } else {
         await bot.sendMessage(chatId, `📝 شكراً لتنبيهنا، سنراجع الحالة.`);
      }
    } else {
        await bot.sendMessage(chatId, "⚠️ السجل قديم جداً أو غير موجود.");
    }
  }
});
