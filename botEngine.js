const bitgetClient = require("./bitgetClient");

const { analyze, trendDirection, getCurrentMode, TRADING_MODES } = require("./strategy");
const { log } = require("./logger");
const { RiskManager, dailyLossCheck, maxDrawdownCheck } = require("./riskManager"); // Updated import
const { getNewsSentiment } = require("./newsManager");

const SL_ATR_MULTIPLIER = parseFloat(process.env.SL_ATR_MULTIPLIER || "0.8");
const TP_ATR_MULTIPLIER = parseFloat(process.env.TP_ATR_MULTIPLIER || "7.0");
const NEWS_API_CALL_INTERVAL_MINUTES = parseInt(process.env.NEWS_API_CALL_INTERVAL_MINUTES || "3");
const BOT_RESTART_RISK_STOP_MINUTES = parseInt(process.env.BOT_RESTART_RISK_STOP_MINUTES || "5");
const BOT_RESTART_OTHER_STOP_MINUTES = parseInt(process.env.BOT_RESTART_OTHER_STOP_MINUTES || "5");

const NEGATIVE_SENTIMENT_THRESHOLD = parseFloat(process.env.NEGATIVE_SENTIMENT_THRESHOLD || "-2.0");
const POSITIVE_SENTIMENT_THRESHOLD = parseFloat(process.env.POSITIVE_SENTIMENT_THRESHOLD || "2.0");

let _runningState = false; // Internal state variable
let tradeHistory = [];
let pnl = 0;
let dailyLoss = 0;
let streak = 0;
let lastNewsApiCallTime = Date.now();

// Initialize risk manager
const riskManager = new RiskManager();

async function runBot(pairs, io){
  log("runBot function started.");
  setRunningState(true); // Set running state to true



  let contractConfigs = {};
  let bitgetContractConfigs = {};


  try {
    bitgetContractConfigs = await bitgetClient.getContractConfig();
    log("Fetched Bitget contract configurations.");
  } catch (error) {
    log(`ERROR fetching Bitget contract configurations: ${error.message}`);
  }


  
  // Merge contract configurations
  contractConfigs = { ...bitgetContractConfigs };

  let riskLimitHit = false; // Flag to indicate if risk limit was hit

  // Initialize balance tracking variables
  let initialBalance = 0;
  let peakBalance = 0;
  let currentBalance = 0; // To be updated in the loop

  // Helper to get the correct client based on symbol
  const getClient = (symbol) => {
    return bitgetClient;
  };

  while(getRunningState()){
    let sentimentScore = 0;
    const currentTime = Date.now();
    if (currentTime - lastNewsApiCallTime > NEWS_API_CALL_INTERVAL_MINUTES * 60 * 1000) {
      sentimentScore = await getNewsSentiment(); // Get sentiment score
      lastNewsApiCallTime = currentTime;
    } else {
      log(`Skipping news sentiment fetch. Next fetch in approximately ${Math.round((NEWS_API_CALL_INTERVAL_MINUTES * 60 * 1000 - (currentTime - lastNewsApiCallTime)) / 1000 / 60)} minutes.`);
    }

    log("Entering symbol loop.");
    let bitgetBalances = [];


    try {
      bitgetBalances = await bitgetClient.getBalance();
      log("Fetched Bitget balances successfully.");
    } catch (balanceErr) {
      log(`ERROR fetching Bitget balances: ${balanceErr.message}. Response data: ${balanceErr.response ? JSON.stringify(balanceErr.response.data) : 'N/A'}`);
    }


    
    const balances = [...bitgetBalances];

    const usdt = balances.find(b=>b.marginCoin==="USDT");
    if (!usdt) {
      log("ERROR: USDT balance not found for risk calculation. Skipping risk checks this cycle.");
      await new Promise(r=>setTimeout(r,60000));
      continue;
    }
    currentBalance = Number(usdt.available);

    // Initialize initialBalance and peakBalance on first run
    if (initialBalance === 0) {
      initialBalance = currentBalance;
      peakBalance = currentBalance;
      log(`Initial balance set to: ${initialBalance.toFixed(2)} USDT`);
    }

    // Update peak balance
    if (currentBalance > peakBalance) {
      peakBalance = currentBalance;
    }

    // Calculate daily loss and total drawdown percentages
    const dailyLossPercent = ((initialBalance - currentBalance) / initialBalance) * 100;
    const totalLossPercent = ((peakBalance - currentBalance) / peakBalance) * 100;

    log(`Current Balance: ${currentBalance.toFixed(2)} USDT, Initial Balance: ${initialBalance.toFixed(2)} USDT, Peak Balance: ${peakBalance.toFixed(2)} USDT`);
    log(`Daily Loss Percent: ${dailyLossPercent.toFixed(2)}%, Total Drawdown Percent: ${totalLossPercent.toFixed(2)}%`);

    // Perform risk checks
    if (dailyLossCheck(dailyLossPercent)) {
      log(`Risk limit reached: Daily loss limit exceeded (${dailyLossPercent.toFixed(2)}% vs ${process.env.DAILY_LOSS_LIMIT}%). Stopping bot.`);
      riskLimitHit = true;
      setRunningState(false);
      break; // Exit the while loop
    }
    if (maxDrawdownCheck(totalLossPercent)) {
      log(`Risk limit reached: Max drawdown limit exceeded (${totalLossPercent.toFixed(2)}% vs ${process.env.MAX_DRAWDOWN}%). Stopping bot.`);
      riskLimitHit = true;
      setRunningState(false);
      break; // Exit the while loop
    }

    try {
      await Promise.all(pairs.map(async (symbol) => {
        log(`Processing symbol: ${symbol}`);
        const client = getClient(symbol); // Get the appropriate client for the symbol
        try{
          let candles1, candles15, candles4h;
          log(`Fetching 1m candles for ${symbol}`);
          try {
            candles1 = await client.getCandles(symbol,"1m");
            log(`Fetched 1m candles for ${symbol}. Sample: ${JSON.stringify(candles1.slice(0, 2))}`);
          } catch (candleErr) {
            log(`ERROR fetching 1min candles for ${symbol}: ${candleErr.message}. Response data: ${candleErr.response ? JSON.stringify(candleErr.response.data) : 'N/A'}`);
            return; // Use return instead of continue in async map
          }
          log(`Fetching 15m candles for ${symbol}`);
          try {
            candles15 = await client.getCandles(symbol,"15m");
          } catch (candleErr) {
            log(`ERROR fetching 15min candles for ${symbol}: ${candleErr.message}. Response data: ${candleErr.response ? JSON.stringify(candleErr.response.data) : 'N/A'}`);
            return;
          }
          log(`Fetching 4H candles for ${symbol}`);
          try {
            candles4h = await client.getCandles(symbol,"4H");
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
          let signal, lastRSI, lastEMA, lastATR, lastPrice, aiScore, confidence, mode, factors;
          let trend15 = "UNKNOWN", trend4h = "UNKNOWN";

          try {
            const result = analyze(
              closes1, highs1, lows1, sentimentScore,
              candles1.map(c => Number(c[5]) || 1) // volume data
            );
            signal = result.signal;
            lastRSI = result.lastRSI;
            lastEMA = result.lastEMA;
            lastATR = result.lastATR;
            lastPrice = result.lastPrice;
            aiScore = result.aiScore;
            confidence = result.confidence;
            mode = result.mode;
            factors = result.factors;

            trend15 = trendDirection(closes15);
            trend4h = trendDirection(closes4h);

            log(`Analyze function returned: Signal=${signal}, RSI=${lastRSI}, EMA=${lastEMA}, ATR=${lastATR}, Price=${lastPrice}, AI Score=${aiScore?.toFixed(3)}, Confidence=${confidence?.toFixed(3)}, Mode=${mode}`);
            log(`Trend Direction: 15m=${trend15}, 4h=${trend4h}`);
          } catch (analyzeErr) {
            log(`ERROR during analysis for ${symbol}: ${analyzeErr.message}`);
            return;
          }

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
    i        }
          }
          
          // Advanced Sentiment Filtering
          if (signal === "BUY" && sentimentScore < NEGATIVE_SENTIMENT_THRESHOLD) {
            log(`BUY signal for ${symbol} skipped due to strong negative news sentiment (${sentimentScore.toFixed(2)}).`);
            return;
          } else if (signal === "SELL" && sentimentScore > POSITIVE_SENTIMENT_THRESHOLD) {
            log(`SELL signal for ${symbol} skipped due to strong positive news sentiment (${sentimentScore.toFixed(2)}).`);
            return;
          }
          
          const usdt = balances.find(b=>b.marginCoin==="USDT"); // Corrected property name
          if(!usdt) {
            log("ERROR: USDT balance not found.");
            return;
          }

          const minTradeNum = parseFloat(contractConfigs[symbol]?.minTradeNum);
          let calculatedSize = riskManager.getPositionSize(Number(usdt.available), lastPrice, minTradeNum, null, confidence || 0.5);

          // Apply sentiment multiplier to position size (enhanced with AI score)
          let sentimentMultiplier = 1.0;
          if (signal === "BUY" && (sentimentScore > 1 || aiScore > 0.3)) {
            sentimentMultiplier = Math.min(3.0, 1.0 + (sentimentScore / 2) + (aiScore / 2)); // Capped at 3x
            log(`Positive signals for BUY: sentiment=${sentimentScore.toFixed(2)}, AI=${aiScore.toFixed(2)}, multiplier=${sentimentMultiplier.toFixed(2)}x`);
          } else if (signal === "SELL" && (sentimentScore < -1 || aiScore < -0.3)) {
            sentimentMultiplier = Math.min(3.0, 1.0 + Math.abs(sentimentScore / 2) + Math.abs(aiScore / 2)); // Capped at 3x
            log(`Negative signals for SELL: sentiment=${sentimentScore.toFixed(2)}, AI=${aiScore.toFixed(2)}, multiplier=${sentimentMultiplier.toFixed(2)}x`);
          }
          calculatedSize *= sentimentMultiplier;
          log(`Adjusted position size with signals: ${calculatedSize.toFixed(8)}`);

          if(lastATR > 5*ATRcalculate(closes1)){ log("ATR spike detected. Skipping."); return; }

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
            await client.placeMarket(symbol, signal==="BUY"?"buy":"sell", quantity); // Use calculated quantity
            tradeHistory.push({
              symbol,
              side: signal,
              price: lastPrice,
              aiScore,
              confidence,
              mode,
              timestamp: Date.now()
            });

            // Update risk manager with trade execution (will be updated with result later)
            log(`TRADE EXECUTED: ${signal} ${symbol}@${lastPrice} (Mode: ${mode}, AI Score: ${aiScore?.toFixed(3)}, Confidence: ${confidence?.toFixed(3)})`);

            // Calculate and place dynamic SL/TP orders with mode-specific adjustments
            let stopLossTriggerPrice, takeProfitTriggerPrice;

            let dynamicSLMultiplier = SL_ATR_MULTIPLIER;
            let dynamicTPMultiplier = TP_ATR_MULTIPLIER;

            // Mode-specific SL/TP adjustments
            if (mode === TRADING_MODES.SCALPING) {
              // Tighter stops for scalping
              dynamicSLMultiplier *= 0.7; // 30% tighter stops
              dynamicTPMultiplier *= 0.5; // 50% closer targets
              log(`Scalping mode: Using tighter SL/TP ratios`);
            } else {
              // Wider stops for trend following
              dynamicSLMultiplier *= 1.2; // 20% wider stops
              dynamicTPMultiplier *= 1.5; // 50% wider targets
              log(`Trend mode: Using wider SL/TP ratios`);
            }

            // Dynamic adjustment based on volatility
            if (longTermATR > 0) { // Avoid division by zero
              const volatilityRatio = lastATR / longTermATR;
              if (volatilityRatio > 1.5) { // Short-term volatility significantly higher
                dynamicSLMultiplier *= 1.0; // No reduction during high volatility
                dynamicTPMultiplier *= 1.0;
                log(`High short-term volatility detected. Maintaining SL/TP multipliers at ${dynamicSLMultiplier.toFixed(2)} and ${dynamicTPMultiplier.toFixed(2)}.`);
              } else { // Low short-term volatility
                dynamicSLMultiplier *= 1.5; // Increase multiplier by 50%
                dynamicTPMultiplier *= 1.5;
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
              // Log the error and proceed without TP/SL for this trade.
            } else {
              const tickSize = 1 / Math.pow(10, pricePlace); // Calculate the smallest price increment

              // Adjust TP/SL to ensure they are strictly greater/less than lastPrice after rounding
              if (signal === "BUY") {
                // Ensure TP is strictly > lastPrice
                let roundedTP = parseFloat(takeProfitTriggerPrice.toFixed(pricePlace));
                if (roundedTP <= lastPrice) { // If rounded TP is not strictly greater than lastPrice
                  takeProfitTriggerPrice = lastPrice + (2 * tickSize); // Adjust to be two ticks above lastPrice
                } else {
                  takeProfitTriggerPrice = roundedTP; // Use the rounded value
                }

                // Ensure SL is strictly < lastPrice
                let roundedSL = parseFloat(stopLossTriggerPrice.toFixed(pricePlace));
                if (roundedSL >= lastPrice) { // If rounded SL is not strictly less than lastPrice
                  stopLossTriggerPrice = lastPrice - tickSize; // Adjust to be one tick below lastPrice
                } else {
                  stopLossTriggerPrice = roundedSL; // Use the rounded value
                }

              } else { // SELL
                // Ensure TP is strictly < lastPrice
                let roundedTP = parseFloat(takeProfitTriggerPrice.toFixed(pricePlace));
                if (roundedTP >= lastPrice) { // If rounded TP is not strictly less than lastPrice
                  takeProfitTriggerPrice = lastPrice - (2 * tickSize); // Adjust to be two ticks below lastPrice
                } else {
                  takeProfitTriggerPrice = roundedTP; // Use the rounded value
                }

                // Ensure SL is strictly > lastPrice
                let roundedSL = parseFloat(stopLossTriggerPrice.toFixed(pricePlace));
                if (roundedSL <= lastPrice) { // If rounded SL is not strictly greater than lastPrice
                  stopLossTriggerPrice = lastPrice + tickSize; // Adjust to be one tick above lastPrice
                } else {
                  stopLossTriggerPrice = roundedSL; // Use the rounded value
                }
              }

              try {
                await client.placeTpslOrder(
                  symbol,
                  holdSide,
                  stopLossTriggerPrice,
                  takeProfitTriggerPrice,
                  pricePlace // Pass pricePlace to client
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
            price: lastPrice,
            rsi: lastRSI,
            pnl,
            trades: tradeHistory.slice(-20),
            newsSentiment: sentimentScore,
            aiScore: aiScore?.toFixed(3),
            confidence: confidence?.toFixed(3),
            tradingMode: mode,
            riskMetrics: riskManager.getRiskMetrics()
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
  setRunningState(false); // Ensure state is false if loop exits for other reasons
  return { stoppedByRisk: riskLimitHit }; // Return the fla
}


function getRunningState() {
  return _runningState;
}

function setRunningState(state) {
  _runningState = state;
}

function stopBot(){
  setRunningState(false); // Set running state to false
}

// Track trade results for risk management
function updateTradeResult(symbol, result) {
  // Find the most recent trade for this symbol
  const recentTrades = tradeHistory.filter(t => t.symbol === symbol).slice(-1);
  if (recentTrades.length > 0) {
    riskManager.updateStreaksAndCompounding(result);
    log(`Updated risk manager with trade result: ${result} for ${symbol}`);
  }
}

// Get current trading mode
function getCurrentTradingMode() {
  return getCurrentMode();
}

// Get risk metrics
function getRiskMetrics() {
  return riskManager.getRiskMetrics();
}

// Manual mode switching
function setTradingMode(mode) {
  const { setTradingMode: strategySetMode } = require("./strategy");
  return strategySetMode(mode);
}

function ATRcalculate(closes){
  const diffs = closes.slice(1).map((p,i)=>Math.abs(p-closes[i]));
  return diffs.reduce((a,b)=>a+b,0)/diffs.length;
}



async function restartBot(pairs, io) {
  log("Restart bot function started.");
  while (true) {
    log("Attempting to start bot...");
    const { stoppedByRisk } = await runBot(pairs, io);
    if (stoppedByRisk) {
      log(`Bot stopped due to risk limit. Restarting in ${BOT_RESTART_RISK_STOP_MINUTES} minutes...`);
      await new Promise(r => setTimeout(r, BOT_RESTART_RISK_STOP_MINUTES * 60 * 1000));
    } else {
      log(`Bot stopped for unknown reason. Restarting in ${BOT_RESTART_OTHER_STOP_MINUTES} minute(s)...`);
      await new Promise(r => setTimeout(r, BOT_RESTART_OTHER_STOP_MINUTES * 60 * 1000));
    }
  }
}

module.exports={runBot, stopBot, getRunningState, setRunningState, restartBot, updateTradeResult, getCurrentTradingMode, getRiskMetrics, setTradingMode}; // Export new functions

// Start the bot when this script is executed directly
if (require.main === module) {
  require('dotenv').config(); // Ensure dotenv is loaded for process.env.PAIRS
  const pairs = process.env.PAIRS ? process.env.PAIRS.split(',') : ["BTCUSDT", "ETHUSDT"]; // Default if not set
  restartBot(pairs, { emit: () => {} }).catch(err => {
    console.error("Error starting bot:", err);
  });
}