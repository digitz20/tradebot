const { RSI, EMA, ATR } = require("technicalindicators");


// Signal per timeframe
// Now accepts newsSentiment as an additional parameter
function analyze(closes, highs, lows, newsSentiment) {
  // Ensure we have enough data for calculations
  if (closes.length < 20 || highs.length < 20 || lows.length < 20) {
    return { signal: "HOLD", lastRSI: null, lastEMA: null, lastATR: null, lastPrice: null };
  }

  const rsi = RSI.calculate({ values: closes, period: 14 });
  const ema = EMA.calculate({ values: closes, period: 20 });
  const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });

  const lastRSI = rsi[rsi.length - 1];
  const lastEMA = ema[ema.length - 1];
  const lastATR = atr[atr.length - 1] || 0;
  const lastPrice = closes[closes.length - 1];

  // We need previous values to detect crossovers
  const prevPrice = closes[closes.length - 2];
  const prevEMA = ema[ema.length - 2];

  let signal = "HOLD"; // Default signal

  // Ensure we have valid indicator values before making decisions
  // Also check if newsSentiment is a valid number
  if (lastRSI === undefined || lastEMA === undefined || prevPrice === undefined || prevEMA === undefined || typeof newsSentiment !== 'number') {
    return { signal: "HOLD", lastRSI, lastEMA, lastATR, lastPrice };
  }

  // BUY condition: Price crosses above EMA AND RSI is not overbought AND News Sentiment is positive
  if (prevPrice < prevEMA && lastPrice > lastEMA && lastRSI < 70 && newsSentiment > 0) {
    signal = "BUY";
  }
  // SELL condition: Price crosses below EMA AND RSI is not oversold AND News Sentiment is negative
  else if (prevPrice > prevEMA && lastPrice < lastEMA && lastRSI > 30 && newsSentiment < 0) {
    signal = "SELL";
  }

  return { signal, lastRSI, lastEMA, lastATR, lastPrice };
}


// Trend direction for multi-timeframe (this function remains the same)
function trendDirection(closes) {
  // Ensure enough data for EMA calculation
  if (closes.length < 50) { // EMA period 50 needs at least 50 closes
    return "UNKNOWN";
  }
  const emaShort = EMA.calculate({ values: closes, period: 20 });
  const emaLong = EMA.calculate({ values: closes, period: 50 });

  // Ensure EMAs are calculated
  if (emaShort.length === 0 || emaLong.length === 0) {
    return "UNKNOWN";
  }

  return emaShort[emaShort.length - 1] > emaLong[emaLong.length - 1] ? "UP" : "DOWN";
}


module.exports = { analyze, trendDirection };