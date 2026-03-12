const express = require("express");
const app = express();

app.get("/", (req,res)=>{
  res.send("WhatsApp AI Bot Running");
});

app.listen(3000, ()=>{
  console.log("Server running");
});