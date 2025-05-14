// whatsapp_bot_mvp/index.js (GPT-Version mit stabilem Error-Handling)
const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());

// Route für WhatsApp Webhook (WasenderAPI POST-Aufrufe)
app.post("/webhook", async (req, res) => {
  let replyText = "Entschuldigung, es gab ein Problem bei der Verarbeitung.";

  try {
    const message = req.body?.message;
    const sender = req.body?.sender;

    if (!message || !sender) {
      res.status(400).send("Bad Request: Missing message or sender");
      return;
    }

    const isAppointmentRequest = /termin|besuch|vereinbaren/i.test(message);

    const prompt = `Du bist der WhatsApp-Bot der Praxis health4women. Hier ist eine Patientenanfrage: "${message}".

Antwort klar, freundlich und auf Basis folgender Infos:
– Öffnungszeiten: Mo–Do 9–13 Uhr, Di auch 15–18 Uhr
– Adresse: Glacisstraße 61, 8010 Graz
– Leistungen: Schwangerschaftsvorsorge, Verhütung, Hormonberatung, etc.
Wenn es sich um eine Terminanfrage handelt, bitte um Name + Wunschdatum und leite weiter.`;

    const openaiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    replyText = openaiResponse.data?.choices?.[0]?.message?.content || replyText;

    // Antwort zurück an WhatsApp-Nutzer senden
    await axios.post(
      `${process.env.WASENDER_API_URL}/send-message`,
      {
        number: sender,
        message: replyText
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WASENDER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (isAppointmentRequest) {
      console.log(`Terminanfrage erkannt von ${sender}: ${message}`);
      // z.B. sendEmail(sender, message);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Fehler bei Verarbeitung:", error?.response?.data || error.message);
    console.log("OpenAI API Key:", process.env.OPENAI_API_KEY?.slice(0, 8));
    console.log("Wasender API Key:", process.env.WASENDER_API_KEY?.slice(0, 8));
    console.log("Wasender URL:", process.env.WASENDER_API_URL);
    res.status(500).send(replyText);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot läuft auf Port ${PORT}`));
