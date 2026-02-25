const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// Utility function to pause execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const BASE = "https://api.bitget.com";

function sign(timestamp, method, path, body = "") {
    const msg = timestamp + method.toUpperCase() + path + body;
    const signature = crypto.createHmac("sha256", process.env.BITGET_SECRET_KEY).update(msg).digest("base64");
    return signature;
}

async function publicReq(method, path) {
    await sleep(200); // Add a delay before each public request
    return axios({
        method,
        url: BASE + path,
        headers: {
            "Content-Type": "application/json",
        },
    });
}

async function privateReq(method, path, body = "") {
    const ts = Date.now().toString();
    const msg = ts + method.toUpperCase() + path + body;
    const signature = sign(ts, method, path, body);
    // console.log(`Timestamp: ${ts}`);
    // console.log(`Signature Message: ${msg}`);
    // console.log(`Generated Signature: ${signature}`);
    return axios({
        method,
        url: BASE + path,
        headers: {
            "ACCESS-KEY": process.env.BITGET_API_KEY,
            "ACCESS-SIGN": signature,
            "ACCESS-TIMESTAMP": ts,
            "ACCESS-PASSPHRASE": process.env.BITGET_PASSPHRASE,
            "Content-Type": "application/json",
            "paptrading": "1", // Required for demo trading
        },
        data: body || undefined,
    });
}

async function getBalance() {
    const res = await privateReq("GET", "/api/v2/mix/account/accounts?productType=USDT-FUTURES");
    return res.data.data;
}

async function getMarketPrice(symbol) {
    const res = await publicReq("GET", `/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${symbol}`);
    // console.log("Bitget Ticker API Response:", JSON.stringify(res.data, null, 2)); // Log the full response
    if (res.data && res.data.data && res.data.data.length > 0) {
        return parseFloat(res.data.data[0].lastPr); // Corrected field name
    }
    throw new Error("Could not retrieve market price from Bitget ticker API.");
}

async function placeMarket(symbol, side, size) {
    const body = JSON.stringify({
        symbol,
        productType: "USDT-FUTURES",
        marginMode: "crossed", // Assuming crossed margin mode
        marginCoin: "USDT", // Assuming USDT as margin coin
        size: size.toString(),
        side,
        tradeSide: "open", // For opening a new position
        orderType: "market",
        force: "fok" // Fill Or Kill for market orders
    });
    return privateReq("POST", "/api/v2/mix/order/place-order", body);
}

async function getCandles(symbol, period="1min") {
    // Bitget Futures API for candles uses 'granularity' instead of 'period'
    // Common granularities: 1m, 5m, 15m, 30m, 1h, 4h, 12h, 1d, 1w, 1M
    const res = await publicReq("GET", `/api/v2/mix/market/candles?productType=USDT-FUTURES&symbol=${symbol}&granularity=${period}&limit=100`);
    return res.data.data;
}

async function placeTpslOrder(symbol, holdSide, stopLossTriggerPrice, takeProfitTriggerPrice, pricePlace) {
    const data = {
        marginCoin: "USDT",
        productType: "usdt-futures",
        symbol: symbol,
        stopSurplusTriggerPrice: takeProfitTriggerPrice.toFixed(pricePlace), // Use dynamic precision
        stopSurplusTriggerType: "mark_price",
        stopSurplusExecutePrice: null, // Market close
        stopLossTriggerPrice: stopLossTriggerPrice.toFixed(pricePlace), // Use dynamic precision
        stopLossTriggerType: "mark_price",
        stopLossExecutePrice: null, // Market close
        holdSide: holdSide
  };
  const body = JSON.stringify(data);
  const res = await privateReq("POST", "/api/v2/mix/order/place-pos-tpsl", body);
  return res.data;
}

async function getContractConfig() {
    const res = await publicReq("GET", "/api/v2/mix/market/contracts?productType=USDT-FUTURES");
    return res.data.data;
}

module.exports = {
    getCandles, // Added getCandles to exports
    getBalance,
    placeMarket,
    getMarketPrice,
    placeTpslOrder,
    getContractConfig
};