const fs = require("fs");
const { sendEmail } = require("./emailService");

function log(msg){
  const time = new Date().toISOString();
  const line = `[${time}] ${msg}\n`;
  console.log(line);
  fs.appendFileSync("bot.log", line);

  if (msg.includes("ERROR") || msg.includes("Risk limit reached") || msg.includes("Negative news detected") || msg.includes("TRADE EXECUTED")) {
    sendEmail("Trading Bot Alert", msg);
  }
}
module.exports = { log };