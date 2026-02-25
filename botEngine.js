const { getCandles, getBalance, placeMarket, placeTpslOrder, getContractConfig } = require("./bitgetClient");
const { analyze, trendDirection } = require("./strategy");
const { log } = require("./logger");
const { getPositionSize, dailyLossCheck, maxDrawdownCheck } = require("./riskManager");
const { getNewsSentiment } = require("./newsManager");

const SL_ATR_MULTIPLIER = parseFloat(process.env.SL_ATR_MULTIPLIER || "1.5");
const TP_ATR_MULTIPLIER = parseFloat(process.env.TP_ATR_MULTIPLIER || "2.0");
const NEWS_API_CALL_INTERVAL_MINUTES = parseInt(process.env.NEWS_API_CALL_INTERVAL_MINUTES || "15");

const NEGATIVE_SENTIMENT_THRESHOLD = parseFloat(process.env.NEGATIVE_SENTIMENT_THRESHOLD || "-1.5");
const POSITIVE_SENTIMENT_THRESHOLD = parseFloat(process.env.POSITIVE_SENTIMENT_THRESHOLD || "1.5");

let running=false;
let tradeHistory=[];
let pnl=0;
let dailyLoss=0;
let streak=0;
let lastNewsApiCallTime = Date.now();

async function runBot(pairs, io){
  log("runBot function started.");
  running=true;

  let contractConfigs = {};
  try {
    const configs = await getContractConfig();
    configs.forEach(config => {
      contractConfigs[config.symbol] = config;
    });
    log("Fetched contract configurations.");
  } catch (error) {
    log(`ERROR fetching contract configurations: ${error.message}`);
    // Depending on how critical this is, you might want to stop the bot or retry
  }

  while(running){
    let sentimentScore = 0;
    const currentTime = Date.now();
    if (currentTime - lastNewsApiCallTime > NEWS_API_CALL_INTERVAL_MINUTES * 60 * 1000) {
      sentimentScore = await getNewsSentiment(); // Get sentiment score
      lastNewsApiCallTime = currentTime;
    } else {
      log(`Skipping news sentiment fetch. Next fetch in approximately ${Math.round((NEWS_API_CALL_INTERVAL_MINUTES * 60 * 1000 - (currentTime - lastNewsApiCallTime)) / 1000 / 60)} minutes.`);
    }

    log("Entering symbol loop.");
    try {
      await Promise.all(pairs.map(async (symbol) => {
        log(`Processing symbol: ${symbol}`);
        try{
          let candles1, candles15, candles4h;
          log(`Fetching 1m candles for ${symbol}`);
          try {
            candles1 = await getCandles(symbol,"1m");
            log(`Fetched 1m candles for ${symbol}. Sample: ${JSON.stringify(candles1.slice(0, 2))}`);
          } catch (candleErr) {
            log(`ERROR fetching 1min candles for ${symbol}: ${candleErr.message}. Response data: ${candleErr.response ? JSON.stringify(candleErr.response.data) : 'N/A'}`);
            return; // Use return instead of continue in async map
          }
          log(`Fetching 15m candles for ${symbol}`);
          try {
            candles15 = await getCandles(symbol,"15m");
          } catch (candleErr) {
            log(`ERROR fetching 15min candles for ${symbol}: ${candleErr.message}. Response data: ${candleErr.response ? JSON.stringify(candleErr.response.data) : 'N/A'}`);
            return;
          }
          log(`Fetching 4H candles for ${symbol}`);
          try {
            candles4h = await getCandles(symbol,"4H");
          } catch (candleErr) {
            log(`ERROR fetching 4h candles for ${symbol}: ${candleErr.message}. Response data: ${candleErr.response ? JSON.stringify(candleErr.response.data) : 'N/A'}`);
            return;
          }

          log("Mapping candle data...");
          const closes1 = candles1.map(c=>Number(c[4]));
          const highs1 = candles1.map(c=>Number(c[2]));
          const lows1 = candles1.map(c=>Number(c[3]));

          const closes15 = candles15.map(c=>Number(c[4]));
          const closes4h = candles4h.map(c=>Number(c[4]));
          const longTermATR = ATRcalculate(closes4h);
          log(`Long-term ATR (4H): ${longTermATR}`);

          log("Calling analyze function...");
          const { signal, lastRSI, lastEMA, lastATR, lastPrice } = analyze(closes1, highs1, lows1);
          log(`Analyze function returned: Signal=${signal}, RSI=${lastRSI}, EMA=${lastEMA}, ATR=${lastATR}, Price=${lastPrice}`);
          const trend15 = trendDirection(closes15);
           const trend4h = trendDirection(closes4h);
           log(`Trend Direction: 15m=${trend15}, 4h=${trend4h}`);

          log("Starting multi-timeframe confirmation...");

          // Multi-timeframe confirmation logic
          if (signal === "BUY") {
            if (trend15 === "DOWN" || trend4h === "DOWN") {
              log(`BUY signal for ${symbol} skipped due to conflicting longer-term trends (15m: ${trend15}, 4h: ${trend4h}).`);
              return;
            }
          } else if (signal === "SELL") {
            if (trend15 === "UP" || trend4h === "UP") {
              log(`SELL signal for ${symbol} skipped due to conflicting longer-term trends (15m: ${trend15}, 4h: ${trend4h}).`);
              return;
            }
          }
          
          // Advanced Sentiment Filtering
          if (signal === "BUY" && sentimentScore < NEGATIVE_SENTIMENT_THRESHOLD) {
            log(`BUY signal for ${symbol} skipped due to strong negative news sentiment (${sentimentScore.toFixed(2)}).`);
            return;
          } else if (signal === "SELL" && sentimentScore > POSITIVE_SENTIMENT_THRESHOLD) {
            log(`SELL signal for ${symbol} skipped due to strong positive news sentiment (${sentimentScore.toFixed(2)}).`);
            return;
          }
          
          let balances;
          try {
            balances = await getBalance();
          } catch (balanceErr) {
            log(`ERROR fetching balance: ${balanceErr.message}. Response data: ${balanceErr.response ? JSON.stringify(balanceErr.response.data) : 'N/A'}`);
            return; // Skip this iteration if balance fetch fails
          }
          const usdt = balances.find(b=>b.marginCoin==="USDT"); // Corrected property name
          if(!usdt) {
            log("ERROR: USDT balance not found.");
            return;
          }

          const minTradeNum = parseFloat(contractConfigs[symbol]?.minTradeNum);
          let calculatedSize = getPositionSize(Number(usdt.available), lastPrice, minTradeNum, streak);

          // Apply sentiment multiplier to position size
          let sentimentMultiplier = 1.0;
          if (signal === "BUY" && sentimentScore > 1) {
            sentimentMultiplier = 1.2; // Increase size by 20% for positive sentiment
            log(`Positive news sentiment (${sentimentScore.toFixed(2)}) for BUY signal. Increasing size.`);
          } else if (signal === "SELL" && sentimentScore < -1) {
            sentimentMultiplier = 1.2; // Increase size by 20% for negative sentiment
            log(`Negative news sentiment (${sentimentScore.toFixed(2)}) for SELL signal. Increasing size.`);
          } else if (signal === "BUY" && sentimentScore < -1) {
            sentimentMultiplier = 0.5; // Reduce size by 50% for conflicting sentiment
            log(`Conflicting news sentiment (${sentimentScore.toFixed(2)}) for BUY signal. Reducing size.`);
          } else if (signal === "SELL" && sentimentScore > 1) {
            sentimentMultiplier = 0.5; // Reduce size by 50% for conflicting sentiment
            log(`Conflicting news sentiment (${sentimentScore.toFixed(2)}) for SELL signal. Reducing size.`);
          }
          calculatedSize *= sentimentMultiplier;
          log(`Adjusted position size with sentiment: ${calculatedSize.toFixed(8)}`);

          log(`Type of dailyLossCheck: ${typeof dailyLossCheck}`);
          if(dailyLossCheck(dailyLoss) || maxDrawdownCheck(pnl)){
            log("Risk limit reached. Stopping bot.");
            running=false; return;
          }
          if(lastATR > 2*ATRcalculate(closes1)){ log("ATR spike detected. Skipping."); return; }

          log(`USDT available: ${usdt.available}`);
          log(`Calculated position size (USDT): ${calculatedSize.toFixed(8)}`);
          log(`Last price: ${lastPrice}`);
          const quantity = (calculatedSize / lastPrice).toFixed(8);
          log(`Calculated quantity: ${quantity}`);

          if (minTradeNum && parseFloat(quantity) < minTradeNum) {
            log(`Calculated quantity (${quantity}) for ${symbol} is less than minimum trade number (${minTradeNum}). Skipping trade.`);
            return;
          }

          if (signal === "BUY" || signal === "SELL") {
            // Execute trade
            await placeMarket(symbol, signal==="BUY"?"buy":"sell", quantity); // Use calculated quantity
            tradeHistory.push({symbol,side:signal,price:lastPrice});
            streak = signal==="BUY"? (streak>=0?streak+1:1) : (streak<=0?streak-1:-1);
            pnl += lastPrice;
            log(`TRADE EXECUTED: ${signal} ${symbol}@${lastPrice}`);

            // Calculate and place dynamic SL/TP orders
            let stopLossTriggerPrice, takeProfitTriggerPrice;

            let dynamicSLMultiplier = SL_ATR_MULTIPLIER;
            let dynamicTPMultiplier = TP_ATR_MULTIPLIER;

            // Dynamic adjustment based on volatility
            if (longTermATR > 0) { // Avoid division by zero
              const volatilityRatio = lastATR / longTermATR;
              if (volatilityRatio > 1.5) { // Short-term volatility significantly higher
                dynamicSLMultiplier *= 0.8; // Reduce multiplier by 20%
                dynamicTPMultiplier *= 0.8;
                log(`High short-term volatility detected. Reducing SL/TP multipliers to ${dynamicSLMultiplier.toFixed(2)} and ${dynamicTPMultiplier.toFixed(2)}.`);
              } else if (volatilityRatio < 0.7) { // Short-term volatility significantly lower
                dynamicSLMultiplier *= 1.2; // Increase multiplier by 20%
                dynamicTPMultiplier *= 1.2;
                log(`Low short-term volatility detected. Increasing SL/TP multipliers to ${dynamicSLMultiplier.toFixed(2)} and ${dynamicTPMultiplier.toFixed(2)}.`);
              }
            }

            const holdSide = signal === "BUY" ? "long" : "short";

            if (signal === "BUY") {
              stopLossTriggerPrice = lastPrice - (lastATR * dynamicSLMultiplier);
              takeProfitTriggerPrice = lastPrice + (lastATR * dynamicTPMultiplier);
            } else { // SELL
              stopLossTriggerPrice = lastPrice + (lastATR * dynamicSLMultiplier);
              takeProfitTriggerPrice = lastPrice - (lastATR * dynamicTPMultiplier);
            }

            // Get price precision from contract configurations
            const pricePlace = contractConfigs[symbol]?.pricePlace;
            if (pricePlace === undefined) {
              log(`ERROR: Could not get pricePlace for ${symbol}. Skipping TP/SL order.`);
              // We should not continue here, as the trade was already executed.
              // Instead, we log the error and proceed without TP/SL for this trade.
            } else {
              try {
                await placeTpslOrder(
                  symbol,
                  holdSide,
                  stopLossTriggerPrice,
                  takeProfitTriggerPrice,
                  pricePlace // Pass pricePlace to bitgetClient
                );
                log(`Placed TP/SL orders for ${symbol}: SL=${stopLossTriggerPrice.toFixed(pricePlace)}, TP=${takeProfitTriggerPrice.toFixed(pricePlace)}`);
              } catch (tpslErr) {
                log(`ERROR placing TP/SL orders for ${symbol}: ${tpslErr.message}. Response data: ${tpslErr.response ? JSON.stringify(tpslErr.response.data) : 'N/A'}`);
              }
            }
          } else {
            log(`No trade executed for ${symbol} due to signal: ${signal}`);
          }

          io.emit("update",{
            symbol,
            price:lastPrice,
            rsi:lastRSI,
            pnl,
            trades:tradeHistory.slice(-20),
            newsSentiment: sentimentScore // Emit news sentiment
          });

        }catch(err){
          log(`ERROR in symbol loop for ${symbol}: ${err.message}. Response data: ${err.response ? JSON.stringify(err.response.data) : 'N/A'}`);
        }
      }));
    } catch (allPromisesError) {
      log(`ERROR during parallel symbol processing: ${allPromisesError.message}`);
    }

    await new Promise(r=>setTimeout(r,60000));
  }
}




function stopBot(){ running=false; }

function ATRcalculate(closes){
  const diffs = closes.slice(1).map((p,i)=>Math.abs(p-closes[i]));
  return diffs.reduce((a,b)=>a+b,0)/diffs.length;
}

module.exports={runBot, stopBot};

// Start the bot when this script is executed directly
if (require.main === module) {
  require('dotenv').config(); // Ensure dotenv is loaded for process.env.PAIRS
  const pairs = process.env.PAIRS ? process.env.PAIRS.split(',') : ["BTCUSDT", "ETHUSDT"]; // Default if not set
  runBot(pairs, { emit: () => {} }).catch(err => {
    console.error("Error starting bot:", err);
  });
}