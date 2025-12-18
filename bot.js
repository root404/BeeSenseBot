
import { GoogleGenAI, Type } from "@google/genai";
import TelegramBot from 'node-telegram-bot-api';
import process from 'process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';

// --- SERVER SETUP (Prevent Render Sleep) ---
const PORT = process.env.PORT || 3000;
const START_TIME = new Date().toLocaleString('en-US', { timeZone: 'UTC' });

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<h1>BeeSenseBot Active - Gemini 3 Flash</h1><p>Status: Online</p><p>Started: ${START_TIME}</p>`);
});
server.listen(PORT);

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; 
const API_KEY = process.env.API_KEY || process.env.API_KEY_1;

const getAIClient = () => new GoogleGenAI({ apiKey: API_KEY });

// --- DATABASE SETUP ---
const DB_PATH = path.join(process.cwd(), 'users_db.json');
let usersDB = {};
if (fs.existsSync(DB_PATH)) {
    try { usersDB = JSON.parse(fs.readFileSync(DB_PATH)); } catch (e) { usersDB = {}; }
}

const saveDB = () => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(usersDB, null, 2));
    } catch (e) {
        console.error("Failed to save DB:", e);
    }
};

const getUser = (id) => {
    if (!usersDB[id]) {
        usersDB[id] = { id, freeScans: 3, isPaid: false, joinDate: Date.now() };
        saveDB();
    }
    return usersDB[id];
};

// --- TELEGRAM BOT INITIALIZATION ---
// We start with polling disabled to clear any existing webhooks first
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Graceful fix for 409 Conflict: Delete webhook then start polling
bot.deleteWebHook()
  .then(() => {
    console.log("✅ Webhook cleared. Starting polling...");
    return bot.startPolling();
  })
  .catch(err => console.error("❌ Polling error:", err.message));

// Handle Render's shutdown signals to stop polling immediately
const shutdown = async () => {
  console.log("Shutting down BeeSenseBot...");
  await bot.stopPolling();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const WELCOME_MSG = `👨‍⚕️ *BeeSenseBot – خبير أمراض النحل (Gemini 3 Flash)*

أهلاً بك في أول مختبر ذكاء اصطناعي متخصص في أمراض النحل في تونس 🇹🇳.

🔍 *ماذا يقدم لك البوت؟*
- تشخيص دقيق للفاروا، تعفن الحضنة، والعديد من الأمراض.
- بروتوكولات علاج علمية معتمدة.

🎁 لديك *3 محاولات فحص مجانية* لتجربة دقة النظام.
أرسل صورة للنحل أو الحضنة الآن للبدء!`;

const PAYMENT_MSG = `⚠️ *انتهت المحاولات المجانية!*

لمواصلة استخدام خبير أمراض النحل والحصول على تشخيصات غير محدودة، يرجى تفعيل الاشتراك (ثمن رمزي لمرة واحدة):

💳 *طرق التفعيل في تونس:*
1. **D17:** أرسل 10 دينار إلى الرقم [أدخل رقمك هنا] ثم أرسل صورة الوصل هنا.
2. **رصيد هاتف:** أرسل كارت شحن بقيمة 10 دينار هنا.

سيقوم فريقنا بتفعيل حسابك فوراً بمجرد استلام الكود أو الوصل.`;

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, WELCOME_MSG, { parse_mode: 'Markdown' });
});

bot.onText(/\/activate (\d+)/, (msg, match) => {
    if (ADMIN_ID && msg.chat.id.toString() !== ADMIN_ID.toString()) return;
    const targetId = match[1];
    if (usersDB[targetId]) {
        usersDB[targetId].isPaid = true;
        saveDB();
        bot.sendMessage(targetId, "✅ *تم تفعيل اشتراكك بنجاح!* يمكنك الآن استخدام البوت بشكل غير محدود.", { parse_mode: 'Markdown' });
        bot.sendMessage(msg.chat.id, `✅ تم تفعيل المستخدم ${targetId}`);
    } else {
        bot.sendMessage(msg.chat.id, `❌ المستخدم ${targetId} غير موجود في القاعدة.`);
    }
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);

    if (!user.isPaid && user.freeScans <= 0) {
        return bot.sendMessage(chatId, PAYMENT_MSG, { parse_mode: 'Markdown' });
    }

    bot.sendMessage(chatId, "🔍 جاري التحليل المتقدم باستخدام Gemini 3 Flash...");

    try {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const fileLink = await bot.getFileLink(fileId);
        
        const responseImage = await new Promise((resolve, reject) => {
            https.get(fileLink, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
                res.on('error', (err) => reject(err));
            }).on('error', (err) => reject(err));
        });

        const ai = getAIClient();
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: {
                parts: [
                    { inlineData: { mimeType: "image/jpeg", data: responseImage } },
                    { text: "Analyze this bee image as a Ph.D. Bee Pathologist. Identify diseases. Return Arabic JSON with keys: conditionName, severity, description, recommendedTreatment (array), preventativeMeasures (array)." }
                ]
            },
            config: {
                responseMimeType: "application/json",
                temperature: 0.1
            }
        });

        const diagnosis = JSON.parse(response.text);

        if (!user.isPaid) {
            user.freeScans -= 1;
            saveDB();
        }

        const msgContent = `🔬 *نتائج الفحص:*
🦠 *المرض:* ${diagnosis.conditionName || 'غير محدد'}
⚠️ *الخطورة:* ${diagnosis.severity || 'متوسطة'}

📝 *الوصف:* ${diagnosis.description}

💊 *العلاج الموصى به:*
${Array.isArray(diagnosis.recommendedTreatment) ? diagnosis.recommendedTreatment.map(t => `• ${t}`).join('\n') : diagnosis.recommendedTreatment}

🛡️ *الوقاية:*
${Array.isArray(diagnosis.preventativeMeasures) ? diagnosis.preventativeMeasures.map(p => `• ${p}`).join('\n') : diagnosis.preventativeMeasures}

${!user.isPaid ? `📉 المحاولات المتبقية: ${user.freeScans}` : '♾️ اشتراك فعال (غير محدود)'}`;

        bot.sendMessage(chatId, msgContent, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error("Analysis Error:", error);
        bot.sendMessage(chatId, "❌ حدث خطأ في التحليل. يرجى المحاولة بصورة أوضح.");
    }
});

bot.on('message', (msg) => {
    if (msg.photo || (msg.text && msg.text.startsWith('/'))) return;
    const user = getUser(msg.chat.id);
    if (!user.isPaid && user.freeScans <= 0) {
        if (ADMIN_ID) {
            bot.sendMessage(ADMIN_ID, `📩 *طلب تفعيل:*
ID: \`${msg.chat.id}\`
الرسالة: ${msg.text}
التفعيل: \`/activate ${msg.chat.id}\``, { parse_mode: 'Markdown' });
        }
        bot.sendMessage(msg.chat.id, "⏳ شكراً. جاري مراجعة طلب التفعيل الخاص بك.");
    }
});

console.log("🚀 BeeSenseBot v3 (Polling Managed) Started.");
