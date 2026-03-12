const express = require("express");
const app = express();

const VERIFY_TOKEN = "mywhatsappbot123";

app.get("/", (req, res) => {
  res.send("WhatsApp AI Bot Running");
});

app.get("/api/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});