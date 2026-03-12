const express = require("express");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "mywhatsappbot123";

app.get("/", (req, res) => {
  res.send("WhatsApp AI Bot Running");
});

app.get("/api/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/api/webhook", async (req, res) => {
  try {
    const message =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;

    if (message) {
      console.log("User:", message);

      const ai = await fetch(
        "https://tebqhqdihdasjedlbnrq.supabase.co/functions/v1/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization":
              "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlYnFocWRpaGRhc2plZGxibnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MzkxMjksImV4cCI6MjA4NjUxNTEyOX0.65yzAAEGancheN_hjR4iSWbZ8kOi9fUOpr3hi5mKCUQ"
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: message }],
            apiKey: "myai_5105358a25de4b5293cb88c1ad99376b"
          })
        }
      );

      const data = await ai.text();

      console.log("AI:", data);
    }

    res.sendStatus(200);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.listen(3000, () => console.log("Server running"));