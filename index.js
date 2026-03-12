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
  process.env.SUPABASE_AUTH_BEARER || "eyJhbGci..."; // Supabase Bearer
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

// Helper: extract text from streaming or normal response
function extractTextFromAIResponse(rawText) {
  // If the response contains SSE lines (data: ...), parse them
  if (rawText.includes("\n") && rawText.trim().startsWith("data:")) {
    let reply = "";
    const lines = rawText.split("\n");
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line === "data: [DONE]" || line === "data: [done]") continue;
      if (!line.startsWith("data:")) continue;

      const payload = line.replace(/^data:\s*/, "");
      try {
        const parsed = JSON.parse(payload);

        // Try a few possible locations for streamed content
        // 1) parsed.choices[0].delta.content (common streaming shape)
        if (parsed?.choices?.[0]?.delta?.content) {
          reply += parsed.choices[0].delta.content;
          continue;
        }

        // 2) parsed.choices[0].message.content (non-stream)
        if (parsed?.choices?.[0]?.message?.content) {
          reply += parsed.choices[0].message.content;
          continue;
        }

        // 3) parsed.data?.choices... (some services wrap with "data")
        if (parsed?.data?.choices?.[0]?.delta?.content) {
          reply += parsed.data.choices[0].delta.content;
          continue;
        }

        // 4) parsed.reply or parsed.text
        if (parsed?.reply) {
          reply += parsed.reply;
          continue;
        }
        if (parsed?.text) {
          reply += parsed.text;
          continue;
        }

        // fallback: attempt to stringify small useful fields (avoid huge dumps)
        if (parsed?.choices) {
          try {
            const small = JSON.stringify(parsed.choices).slice(0, 2000);
            reply += small;
          } catch {}
        }
      } catch (err) {
        // not JSON — append raw payload if it looks like plain text
        reply += payload;
      }
    }
    return reply;
  }

  // Otherwise try JSON parse (non-streamed)
  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed === "string") return parsed;
    if (parsed?.reply) return parsed.reply;
    if (parsed?.choices?.[0]?.message?.content) return parsed.choices[0].message.content;
    if (parsed?.choices?.[0]?.delta?.content) return parsed.choices[0].delta.content;
    if (parsed?.data?.choices?.[0]?.message?.content)
      return parsed.data.choices[0].message.content;
    // fallback to short stringified version
    return JSON.stringify(parsed).slice(0, 4000);
  } catch (err) {
    // not JSON — return raw text
    return rawText;
  }
}

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

    const raw = await aiResponse.text();
    const aiReplyUntrimmed = extractTextFromAIResponse(raw).trim();

    // Truncate to safe length for WhatsApp (max 4096). leave small headroom.
    const aiReply = (aiReplyUntrimmed || "Sorry, I couldn't generate a reply.").substring(0, 4000);

    console.log("AI reply (trimmed):", aiReply.slice(0, 200)); // log only the start for readability

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
        text: { body: aiReply }
      })
    });

    const sendJson = await sendRes.json().catch(() => null);
    if (!sendRes.ok) {
      console.error("Error sending message to WhatsApp:", sendRes.status, sendJson);
    } else {
      console.log("Sent reply to", from, ":", aiReply.slice(0, 120));
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
  }
});

// Start server (listen on process.env.PORT for Render/Fly/Heroku)
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});