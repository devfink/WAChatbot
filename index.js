// whatsapp_bot_mvp/index.js (Gemini-Version mit TTL-Caching für Website)
const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());

// Simple TTL-Cache für Website-Inhalte
let cachedWebsiteText = null;
let cacheTimestamp = 0;
const CACHE_TTL_MINUTES = 60; // 1 Stunde gültig

async function fetchWebsiteContent() {
  const now = Date.now();
  const cacheValid = now - cacheTimestamp < CACHE_TTL_MINUTES * 60 * 1000;

  if (cachedWebsiteText && cacheValid) {
    console.log("ℹ️ Website-Inhalt aus Cache");
    return cachedWebsiteText;
  }

  try {
    console.log("🌐 Website-Inhalt neu laden...");
    const response = await axios.get("https://health4women.at");
    const html = response.data;

    const textOnly = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500);

    cachedWebsiteText = textOnly;
    cacheTimestamp = now;

    return textOnly;
  } catch (err) {
    console.error("❌ Fehler beim Laden der Website:", err.message);
    return "Website-Inhalte konnten nicht geladen werden.";
  }
}

app.post("/webhook", async (req, res) => {
  let replyText = "Entschuldigung, es gab ein Problem bei der Verarbeitung.";

  try {
    const message = req.body?.data?.messages?.message?.conversation;
    const senderRaw = req.body?.data?.messages?.remoteJid;
    const sender = senderRaw?.replace(/@s\.whatsapp\.net$/, "");

    console.log("📨 Nachricht:", message);
    console.log("👤 Absender (raw):", senderRaw);
    console.log("👤 Absender (clean):", sender);

    if (!message || !sender) {
      res.status(400).send("Bad Request: Missing message or sender");
      return;
    }

    const isAppointmentRequest = /termin|besuch|vereinbaren/i.test(message);
    const siteText = await fetchWebsiteContent();

    const prompt = `Du bist der WhatsApp-Bot der Praxis health4women. Hier ist eine Patientenanfrage: "${message}".

Die folgenden Informationen stammen von der Website (automatisch geladen):
${siteText}

Antworte klar, freundlich und auf Basis der Inhalte. Bei Terminanfragen bitte um Name + Wunschdatum.`;

    const geminiResponse = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        params: {
          key: process.env.GEMINI_API_KEY
        },
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    replyText = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || replyText;

    const to = sender.startsWith("+") ? sender : `+${sender}`;

    await axios.post(
      `${process.env.WASENDER_API_URL}/send-message`,
      {
        to: to,
        text: replyText
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WASENDER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (isAppointmentRequest) {
      console.log(`📅 Terminanfrage erkannt von ${to}: ${message}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Fehler bei Verarbeitung:", error?.response?.data || error.message);
    console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY?.slice(0, 8));
    console.log("Wasender API Key:", process.env.WASENDER_API_KEY?.slice(0, 8));
    console.log("Wasender URL:", process.env.WASENDER_API_URL);
    res.status(500).send(replyText);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot läuft auf Port ${PORT}`));
