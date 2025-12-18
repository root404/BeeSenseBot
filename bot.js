
import { GoogleGenAI, Type } from "@google/genai";
import TelegramBot from 'node-telegram-bot-api';
import process from 'process';
import fs from 'fs';
import path from 'path';
import http from 'http';

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
const ADMIN_ID = process.env.ADMIN_ID; // ارفع الـ ID الخاص بك في متغيرات البيئة
const DATASET_CHANNEL_ID = process.env.DATASET_CHANNEL_ID || "-1003359411043";

let API_KEYS = [
  process.env.API_KEY_1,
  process.env.API_KEY_2
].filter(Boolean);

let currentKeyIndex = 0;
const getAIClient = () => new GoogleGenAI({ apiKey: API_KEYS[currentKeyIndex] });

// --- DATABASE SETUP (Local JSON) ---
const DB_PATH = path.join(process.cwd(), 'users_db.json');
let usersDB = {};
if (fs.existsSync(DB_PATH)) {
    try { usersDB = JSON.parse(fs.readFileSync(DB_PATH)); } catch (e) { usersDB = {}; }
}

const saveDB = () => fs.writeFileSync(DB_PATH, JSON.stringify(usersDB, null, 2));

const getUser = (id) => {
    if (!usersDB[id]) {
        usersDB[id] = { id, freeScans: 3, isPaid: false, joinDate: Date.now() };
        saveDB();
    }
    return usersDB[id];
};

// --- TELEGRAM BOT ---
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const WELCOME_MSG = `👨‍⚕️ *BeeSenseBot – خبير أمراض النحل (Ph.D. Edition)*

أهلاً بك في أول مختبر ذكاء اصطناعي متخصص في أمراض النحل في تونس 🇹🇳.

🔍 *ماذا يقدم لك البوت؟*
- تشخيص دقيق للفاروا، تعفن الحضنة، والعديد من الأمراض.
- بروتوكولات علاج علمية معتمدة.

🎁 لديك *3 محاولات فحص مجانية* لتجربة دقة النظام.
أرسل صورة للنحل أو الحضنة الآن للبدء!`;

const PAYMENT_MSG = `⚠️ *انتهت المحاولات المجانية!*

لمواصلة استخدام خبير أمراض النحل والحصول على تشخيصات غير محدودة، يرجى تفعيل الاشتراك (ثمن رمزي لمرة واحدة):

💳 *طرق التفعيل في تونس:*
1. **D17:** أرسل 10 دينار إلى الرقم [00000000] ثم أرسل صورة الوصل هنا.
2. **رصيد هاتف:** أرسل كارت شحن (Ooredoo/Orange/Telecom) بقيمة 10 دينار هنا.

سيقوم فريقنا بتفعيل حسابك فوراً بمجرد استلام الكود أو الوصل.`;

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, WELCOME_MSG, { parse_mode: 'Markdown' });
});

// Admin command to activate user
bot.onText(/\/activate (\d+)/, (msg, match) => {
    if (msg.chat.id.toString() !== ADMIN_ID?.toString()) return;
    const targetId = match[1];
    if (usersDB[targetId]) {
        usersDB[targetId].isPaid = true;
        saveDB();
        bot.sendMessage(targetId, "✅ *تم تفعيل اشتراكك بنجاح!* يمكنك الآن استخدام البوت بشكل غير محدود.", { parse_mode: 'Markdown' });
        bot.sendMessage(msg.chat.id, `✅ تم تفعيل المستخدم ${targetId}`);
    }
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);

    // Paywall Check
    if (!user.isPaid && user.freeScans <= 0) {
        return bot.sendMessage(chatId, PAYMENT_MSG, { parse_mode: 'Markdown' });
    }

    bot.sendMessage(chatId, "🔍 جاري التحليل باستخدام Gemini 3 Flash...");

    try {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const fileLink = await bot.getFileLink(fileId);
        
        // Fetch image as base64
        const responseImage = await new Promise((resolve) => {
            http.get(fileLink, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
            });
        });

        const ai = getAIClient();
        const result = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: {
                parts: [
                    { inlineData: { mimeType: "image/jpeg", data: responseImage } },
                    { text: "Analyze as Ph.D. Bee Pathologist. Focus on diseases. Return Arabic JSON." }
                ]
            },
            config: {
                responseMimeType: "application/json",
                temperature: 0.1
            }
        });

        const diagnosis = JSON.parse(result.text);

        // Update Usage
        if (!user.isPaid) {
            user.freeScans -= 1;
            saveDB();
        }

        const msgContent = `🔬 *نتائج الفحص:*
🦠 *المرض:* ${diagnosis.conditionName}
⚠️ *الخطورة:* ${diagnosis.severity}

📝 *الوصف:* ${diagnosis.description}

💊 *العلاج الموصى به:*
${diagnosis.recommendedTreatment.map(t => `• ${t}`).join('\n')}

🛡️ *الوقاية:*
${diagnosis.preventativeMeasures.map(p => `• ${p}`).join('\n')}

${!user.isPaid ? `Remaining Free Scans: ${user.freeScans}` : '♾️ Unlimited Subscription'}`;

        bot.sendMessage(chatId, msgContent, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "❌ حدث خطأ في التحليل. حاول مرة أخرى.");
    }
});

// Handle text messages for payment codes
bot.on('message', (msg) => {
    if (msg.photo || msg.text?.startsWith('/')) return;
    
    // Notify admin if user sends a potential payment code or message after limit
    const user = getUser(msg.chat.id);
    if (!user.isPaid && user.freeScans <= 0) {
        bot.sendMessage(ADMIN_ID, `📩 *رسالة دفع محتملة:*
من: ${msg.chat.id}
النص: ${msg.text}
لتفعيل الحساب، أرسل: \`/activate ${msg.chat.id}\``, { parse_mode: 'Markdown' });
        bot.sendMessage(msg.chat.id, "⏳ تم استلام رسالتك. سيتواصل معك فريقنا فور التحقق من البيانات.");
    }
});

console.log("🚀 BeeSenseBot v3 (Tunisia Edition) Started.");
