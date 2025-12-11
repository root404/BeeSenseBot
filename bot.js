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
        <div class="status">✅ السيرفر يعمل بنشاط</div>
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
    console.error("❌ FATAL ERROR: TELEGRAM_TOKEN missing in Environment Variables!");
    process.exit(1);
}

const DATASET_CHANNEL_ID = process.env.DATASET_CHANNEL_ID || "-1003359411043";

// STRICT SECURITY: Only use Environment Variables
let API_KEYS = [
  process.env.API_KEY_1,
  process.env.API_KEY_2,
  process.env.API_KEY_3,
  process.env.API_KEY_4
].filter(key => key && key.trim().length > 10 && !key.includes("ضع_مفتاح"));

if (API_KEYS.length === 0) {
  console.error("❌ FATAL ERROR: No valid API Keys found in Environment Variables (API_KEY_1...4)!");
  process.exit(1);
}

let currentKeyIndex = 0;

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: API_KEYS[currentKeyIndex] });
};

// Ensure dataset directory structure
const DATASET_DIR = path.join(process.cwd(), 'bee_dataset');
const IMAGES_DIR = path.join(DATASET_DIR, 'raw_images');
const DATA_FILE = path.join(DATASET_DIR, 'data.json');

[DATASET_DIR, IMAGES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- TELEGRAM BOT SETUP WITH GRACEFUL SHUTDOWN ---
const bot = new TelegramBot(TELEGRAM_TOKEN, { 
  polling: { interval: 1000, autoStart: true, params: { timeout: 10 } }
});

console.log(`🐝 BeeSenseBot (Ph.D. Mode) is running with ${API_KEYS.length} keys.`);

// Handle Render Shutdown Signals (Fix for 409 Conflict)
const stopBot = async (signal) => {
  console.log(`🛑 Received ${signal}. Stopping polling to allow new instance...`);
  await bot.stopPolling();
  server.close();
  process.exit(0);
};

process.once('SIGTERM', () => stopBot('SIGTERM'));
process.once('SIGINT', () => stopBot('SIGINT'));

// Error Handling to prevent crash logs flooding
bot.on('polling_error', (error) => {
  if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
    console.warn("⚠️ Conflict detected: Old instance is still closing... waiting.");
  } else {
    console.error(`[Polling Error] ${error.code}: ${error.message}`);
  }
});

// --- Ph.D. KNOWLEDGE BASE ---
const VETERINARY_KNOWLEDGE_BASE = `
⚠️ وضع الدكتوراه في علم أمراض النحل (Ph.D. Pathology Mode):
أنت الآن "بروفيسور في علم أمراض الحشرات" متخصص في *Apis mellifera*.
مهمتك: إجراء فحص جنائي دقيق للصورة للكشف عن الأمراض، الطفيليات، والفيروسات فقط.
⛔ ممنوع نهائياً: الحديث عن قوة الخلية، كمية النحل، جودة الملكة، أو مخزون العسل. ركز فقط على "المرض".

🔍 بروتوكول التشخيص المتقدم (Advanced Diagnostic Protocol):

1. **طفيلي الفاروا (Varroa destructor):**
   - افحص ظهر النحل (Tergites) والبطن (Sternites).
   - حدد: هل الإصابة "Phoretic" (على النحل البالغ)؟
   - ابحث عن الفاروا على العذارى (Pupae) عند إزالة الأغطية.
   - قيّم الشدة: (Low: <3 mites visible, Severe: multiple mites on single bees).

2. **الفيروسات (Viral Complex):**
   - **DWV (تشوه الأجنحة):** أجنحة ضامرة، قصيرة، مجعدة. بطون قصيرة.
   - **CBPV (الشلل المزمن):** نحل أسود لامع (Greasy/Hairless)، يرتجف (Trembling)، بطون منتفخة.
   - **ABPV/IAPV:** شلل حاد، اسوداد، موت مفاجئ أمام الخلية.
   - **SBV (تكيس الحضنة الفيروسي):** يرقات تشبه "الزورق" (Gondola shape)، رأس داكن، كيس مائي.

3. **أمراض الحضنة البكتيرية:**
   - **AFB (التعفن الأمريكي - Paenibacillus larvae):**
     - المظهر: أغطية غائرة (Sunken)، مثقوبة (Perforated)، رطبة/دهنية.
     - اليرقة: تتحول لكتلة لزجة بنية (Coffee color)، اختبار العود (Ropiness > 2cm)، قشور صلبة (Scale) ملتصقة بالقاع.
   - **EFB (التعفن الأوروبي - Melissococcus plutonius):**
     - المظهر: يرقات ملتوية (Twisted/Corkscrew)، لون أصفر/كريمي، القصبات الهوائية واضحة، رائحة حمضية.

4. **الفطريات (Fungal Diseases):**
   - **Chalkbrood (التكلس - Ascosphaera apis):** يرقات محنطة صلبة (Mummies)، بيضاء (كالطباشير) أو سوداء/رمادية، توجد في العيون أو مدخل الخلية.
   - **Stonebrood (التحجر - Aspergillus):** يرقات صلبة مخضرة/صفراء (نادر).

5. **طفيليات الأمعاء (Microsporidia):**
   - **Nosema (apis/ceranae):**
     - لا توجد أعراض خارجية واضحة على النحلة نفسها (Dissected gut is white not brown).
     - **العلامة الخارجية الوحيدة:** لطخات برازية (Dysentery streaks) بنية/صفراء على الإطارات والمدخل.
     - (تحذير: فرق بينها وبين إسهال الربيع الطبيعي).

6. **الآفات (Pests):**
   - **Small Hive Beetle (Aethina tumida):** خنافس سوداء صغيرة تركض للاختباء، يرقات تزحف في العسل وتسبب تخمره (Slime).
   - **Wax Moth (Galleria mellonella):** أنفاق حريرية (Webbing) في الشمع، تدمير الحضنة (Bald brood)، يرقات بيضاء سريعة.
   - **Tropilaelaps:** طفيلي أصغر من الفاروا، لونه بني فاتح، سريع الحركة.

📝 التقرير المطلوب:
- اذكر اسم المرض العلمي.
- حدد *بدقة* مكان العلامة في الصورة (مثلاً: "على الجناح الأيسر للنحلة في الوسط").
- حدد درجة الخطورة (Mild, Moderate, Severe, Critical).
- اكتب بروتوكول علاج كيميائي (مثل Amitraz/Formic) وعضوي/وقائي.
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
        reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));
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
  const { msg, chatId, photoId } = requestQueue.shift();

  try {
    if (requestQueue.length > 2) {
      bot.sendMessage(chatId, "⏳ وصل دورك! جاري تحليل الصورة...");
    }

    await handleImageAnalysis(chatId, photoId);
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
     bot.sendMessage(chatId, "🔍 جاري الفحص المجهري...");
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
              { text: `Analyze as Ph.D. Pathologist. ${VETERINARY_KNOWLEDGE_BASE}. Output JSON Arabic.` }
            ]
          },
          config: { 
            responseMimeType: "application/json", 
            responseSchema: diagnosisSchema,
            temperature: 0.0, 
            topK: 1
          }
        });
        break; 
      } catch (e) {
        if (e.message.includes("429") || e.message.includes("Quota")) {
          console.log(`⚠️ Key #${currentKeyIndex + 1} Exhausted. Switching...`);
          currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
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

    if (!diagnosis.isBeeOrHive) {
      await bot.sendMessage(chatId, "⚠️ الصورة لا تحتوي على نحل أو إطارات واضحة للفحص.");
      return;
    }

    // Build Report
    const treatments = diagnosis.recommendedTreatment || [];
    const treatmentText = Array.isArray(treatments) ? treatments.map(t => `• ${t}`).join('\n') : treatments;

    const preventions = diagnosis.preventativeMeasures || [];
    const preventionText = Array.isArray(preventions) ? preventions.map(p => `• ${p}`).join('\n') : preventions;
    
    const symptoms = diagnosis.symptoms || [];
    const symptomsText = symptoms.length > 0 ? symptoms.join('\n- ') : "لا توجد علامات مرضية ظاهرة";

    const severityIcon = diagnosis.severity === "CRITICAL" ? "🔴" : diagnosis.severity === "HEALTHY" ? "🟢" : "🟠";

    let message = `🔬 *تقرير المختبر البيطري (Ph.D. Mode)*\n\n`;
    message += `🦠 *التشخيص:* ${diagnosis.conditionName}\n`;
    message += `${severityIcon} *الخطورة:* ${diagnosis.severity}\n\n`;
    message += `⚠️ *العلامات المكتشفة:* \n- ${symptomsText}\n\n`;
    message += `📝 *التحليل الجنائي:* \n${diagnosis.description}\n\n`;
    
    if (diagnosis.severity !== "HEALTHY") {
        message += `💊 *بروتوكول العلاج:* \n${treatmentText}\n\n`;
        message += `🛡️ *الوقاية:* \n${preventionText}\n\n`;
    } else {
        message += `💡 *التوصية:* \nاستمر في المراقبة الدورية.\n\n`;
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ تشخيص دقيق (أرشفة)", callback_data: `correct_${timestamp}` },
          { text: "❌ غير دقيق", callback_data: `wrong_${timestamp}` }
        ]]
      }
    });

    const record = {
      id: timestamp, filename: filename, current_path: localFilePath,
      diagnosis: diagnosis, user_feedback: "pending", timestamp: new Date().toISOString()
    };
    
    let data = [];
    if (fs.existsSync(DATA_FILE)) {
        try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) {}
    }
    data.push(record);
    if (data.length > 100) data = data.slice(-100);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

  } catch (error) {
    console.error("Analysis Error:", error);
    bot.sendMessage(chatId, "❌ نعتذر، حدث خطأ تقني.");
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👨‍⚕️ *BeeSenseBot (Ph.D. Edition)*\n\nأرسل صورة للنحل أو الحضنة ليتم تحليلها بدقة علمية فائقة.", {parse_mode: 'Markdown'});
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

  try {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: chatId, message_id: query.message.message_id
    });
  } catch (e) {}

  if (fs.existsSync(DATA_FILE)) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const index = data.findIndex(d => d.id === timestampId);
    
    if (index !== -1) {
      const record = data[index];
      const localPath = record.current_path;

      await bot.answerCallbackQuery(query.id, { text: "تم" });
      
      if (action === "correct") {
         await bot.sendMessage(chatId, `✅ تم اعتماد التشخيص.`);
         
         if (fs.existsSync(localPath)) {
             try {
                 const caption = `📁 #Confirmed_Data\n` +
                                 `🦠 ${record.diagnosis.conditionName}\n` +
                                 `⚠️ ${record.diagnosis.severity}\n` +
                                 `#Pathology #${record.diagnosis.conditionName.replace(/\s/g, '_')}`;

                 const fileStream = fs.createReadStream(localPath);
                 const sentMsg = await bot.sendPhoto(DATASET_CHANNEL_ID, fileStream, { caption: caption });
                 
                 const jsonString = JSON.stringify(record.diagnosis, null, 2);
                 const jsonMessage = `📊 *Clinical Data:*\n\`\`\`json\n${jsonString}\n\`\`\``;
                 
                 await bot.sendMessage(DATASET_CHANNEL_ID, jsonMessage, { 
                     parse_mode: "Markdown",
                     reply_to_message_id: sentMsg.message_id
                 });
             } catch (err) {
                 console.error("Archive Failed:", err.message);
             }
         }
      } else {
         await bot.sendMessage(chatId, `📝 شكراً.`);
      }
    }
  }
});
