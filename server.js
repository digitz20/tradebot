require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { runBot, stopBot, getRunningState, setRunningState } = require("./botEngine"); // Import new functions

const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server);
const pairs = process.env.PAIRS.split(",");

app.post('/start', (req, res) => {
  if (!getRunningState()) {
    setRunningState(true); // Set running state to true to allow botLifecycleManager to start it
    res.status(200).send('Bot start initiated. It will start shortly if not already running.');
  } else {
    res.status(200).send('Bot is already running.');
  }
});
app.post("/stop",(req,res)=>{ stopBot(); res.send("Bot stopped"); });

const PORT = process.env.PORT || 3000;
server.listen(PORT,() => {
  console.log(`Server listening on port ${PORT}`);

  // Function to manage bot lifecycle
  const botLifecycleManager = async () => {
    while (true) { // Infinite loop to keep managing the bot
      if (!getRunningState()) { // If bot is not running
        console.log("Bot is not running. Attempting to start...");
                console.log("Bot is not running. Attempting to start...");
        // Pass the 'pairs' array and 'io' object from server.js to runBot
        const result = await runBot(pairs, io); // Run the bot and await its completion

        if (result && result.stoppedByRisk) {
            const restartIntervalMinutes = parseInt(process.env.BOT_RESTART_INTERVAL_MINUTES, 10) || 60; // Parse to integer
          console.log(`Bot stopped due to risk limit. Waiting ${restartIntervalMinutes} minutes before attempting restart.`);
          await new Promise(resolve => setTimeout(resolve, restartIntervalMinutes * 60 * 1000)); // Wait for specified interval
        } else {
          const otherStopRestartIntervalMinutes = parseInt(process.env.BOT_RESTART_OTHER_STOP_MINUTES, 10) || 5; // Parse to integer, default to 5 minutes
          console.log(`Bot stopped for other reasons (e.g., manual stop). Will attempt restart in ${otherStopRestartIntervalMinutes} minutes.`);
          await new Promise(resolve => setTimeout(resolve, otherStopRestartIntervalMinutes * 60 * 1000)); // Wait for specified interval
        }
      } else {
        // If bot is already running, just wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 1 * 60 * 1000)); // Check every minute
      }
    }
  };

  botLifecycleManager(); // Start the bot lifecycle manager
});