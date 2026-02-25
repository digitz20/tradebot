const { RSI, EMA, ATR } = require("technicalindicators");

// Signal per timeframe
function analyze(closes, highs, lows) {
  const rsi = RSI.calculate({ values: closes, period: 14 });
  const ema = EMA.calculate({ values: closes, period: 20 });
  const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });

  const lastRSI = rsi[rsi.length-1];
  const lastEMA = ema[ema.length-1];
  const lastATR = atr[atr.length-1] || 0;
  const lastPrice = closes[closes.length-1];

  let signal = "HOLD";
  if(lastRSI < 30 && lastPrice > lastEMA) signal = "BUY";
  if(lastRSI > 70 && lastPrice < lastEMA) signal = "SELL";

  return { signal, lastRSI, lastEMA, lastATR, lastPrice };
}

// Trend direction for multi-timeframe
function trendDirection(closes) {
  const emaShort = EMA.calculate({ values: closes, period: 20 });
  const emaLong = EMA.calculate({ values: closes, period: 50 });
  return emaShort[emaShort.length-1] > emaLong[emaLong.length-1] ? "UP" : "DOWN";
}

module.exports = { analyze, trendDirection };