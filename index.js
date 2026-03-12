// index.js
const express = require("express");
const app = express();
app.use(express.json());

// ---- Config (from environment variables) ----
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mywhatsappbot123";
const WHATSAPP_PHONE_NUMBER_ID =
  process.env.WHATSAPP_PHONE_NUMBER_ID || "PHONE_NUMBER_ID";
const WHATSAPP_ACCESS_TOKEN =
  process.env.WHATSAPP_ACCESS_TOKEN || "EA..."; // do NOT include "Bearer" here
const SUPABASE_FUNCTION_URL =
  process.env.SUPABASE_FUNCTION_URL ||
  "https://tebqhqdihdasjedlbnrq.supabase.co/functions/v1/chat";
const SUPABASE_AUTH_BEARER =
  process.env.SUPABASE_AUTH_BEARER || "eyJhbGci..."; // the "Authorization: Bearer ..." token for Supabase
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY || "YOUR_API_KEY_HERE"; // optional body param

// ---- Basic endpoints ----
app.get("/", (req, res) => {
  res.send("WhatsApp AI Bot Running");
});

// Verification endpoint required by Meta to verify webhook
app.get("/api/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Main webhook endpoint that receives messages
app.post("/api/webhook", async (req, res) => {
  try {
    // Acknowledge quickly (Meta expects 200). We continue processing after sending this.
    res.sendStatus(200);

    // Safely extract message text and sender
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    if (!messages || !messages.length) {
      console.log("No messages found in webhook payload.");
      return;
    }

    const msg = messages[0];
    const messageText = msg?.text?.body;
    const from = msg?.from; // the user's phone number

    if (!messageText || !from) {
      console.log("Message text or sender missing", JSON.stringify(msg));
      return;
    }

    console.log("Incoming message from", from, ":", messageText);

    // --- Call Supabase AI function using the global fetch (Node 18+) ---
    const aiResponse = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_AUTH_BEARER}`
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: messageText }],
        apiKey: SUPABASE_API_KEY
      })
    });

    // Read body ONCE as text, then try to parse
    const aiText = await aiResponse.text();
    let aiReply = "";

    try {
      const json = JSON.parse(aiText);
      if (typeof json === "string") {
        aiReply = json;
      } else if (json?.reply) {
        aiReply = json.reply;
      } else if (json?.choices?.[0]?.message?.content) {
        aiReply = json.choices[0].message.content;
      } else {
        aiReply = JSON.stringify(json).slice(0, 3000);
      }
    } catch (err) {
      // not JSON — use plain text
      aiReply = aiText;
    }

    if (!aiReply) aiReply = "Sorry, I couldn't generate a reply.";

    console.log("AI reply:", aiReply);

    // --- Send the AI reply back to WhatsApp using the Graph API ---
    const whatsappUrl = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const sendRes = await fetch(whatsappUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: from,
        text: { body: aiReply.substring(0, 4000) 
      })
    });

    const sendJson = await sendRes.json().catch(() => null);
    if (!sendRes.ok) {
      console.error("Error sending message to WhatsApp:", sendRes.status, sendJson);
    } else {
      console.log("Sent reply to", from, ":", aiReply);
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
  }
});

// Start server (listen on process.env.PORT for Render/Fly/Heroku)
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});