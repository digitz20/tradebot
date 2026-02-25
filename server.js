require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { runBot, stopBot } = require("./botEngine");

const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server);
const pairs = process.env.PAIRS.split(",");

app.post("/start",(req,res)=>{ runBot(pairs,io); res.send("Bot started"); });
app.post("/stop",(req,res)=>{ stopBot(); res.send("Bot stopped"); });

const PORT = process.env.PORT || 3000;
server.listen(PORT,() => console.log(`Dashboard http://localhost:${PORT}`));