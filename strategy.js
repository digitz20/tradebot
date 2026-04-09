const { RSI, EMA, ATR } = require("technicalindicators");
const { AIScoringSystem } = require("./aiScoring");

const aiScoring = new AIScoringSystem();

// Trading modes
const TRADING_MODES = {
  SCALPING: 'scalping',
  TREND: 'trend'
};

let currentMode = TRADING_MODES.TREND; // Default mode

// Signal per timeframe with AI scoring and smart entry timing
function analyze(closes, highs, lows, newsSentiment, volumeData = null) {
  // Ensure we have enough data for calculations
  if (closes.length < 50 || highs.length < 50 || lows.length < 50) {
    return { signal: "HOLD", lastRSI: null, lastEMA: null, lastATR: null, lastPrice: null, aiScore: 0, mode: currentMode };
  }

  const candles = closes.map((close, i) => [0, 0, highs[i], lows[i], close, volumeData ? volumeData[i] : 1, 0, 0, 0]);

  // Get AI score
  const aiResult = aiScoring.calculateAIScore(candles, newsSentiment, volumeData);
  const { score: aiScore, confidence, factors } = aiResult;

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

  // Dynamic mode switching based on market conditions
  updateTradingMode(closes, highs, lows, aiScore);

  // AI-enhanced signal generation
  if (confidence > 0.6) { // Only trade with high confidence
    if (currentMode === TRADING_MODES.SCALPING) {
      // Scalping mode: Quick entries with tight stops
      signal = generateScalpingSignal(lastRSI, lastPrice, prevPrice, aiScore, factors);
    } else {
      // Trend mode: Traditional crossover with AI confirmation
      signal = generateTrendSignal(lastRSI, lastPrice, prevPrice, lastEMA, prevEMA, aiScore, factors);
    }

    // Smart entry timing - avoid fake breakouts
    if (signal !== "HOLD") {
      const isFakeBreakout = aiScoring.detectFakeBreakout(candles, signal);
      if (isFakeBreakout) {
        signal = "HOLD"; // Cancel signal if fake breakout detected
      }
    }
  }

  return {
    signal,
    lastRSI,
    lastEMA,
    lastATR,
    lastPrice,
    aiScore,
    confidence,
    mode: currentMode,
    factors
  };
}

// Generate scalping signals
function generateScalpingSignal(rsi, price, prevPrice, aiScore, factors) {
  // Scalping: Look for quick momentum shifts with AI confirmation
  const momentumAligned = Math.sign(factors.momentum) === Math.sign(aiScore);
  const technicalAligned = Math.sign(factors.technical) === Math.sign(aiScore);

  if (momentumAligned && technicalAligned && Math.abs(aiScore) > 0.3) {
    if (aiScore > 0.3 && rsi < 70 && price > prevPrice) {
      return "BUY";
    } else if (aiScore < -0.3 && rsi > 30 && price < prevPrice) {
      return "SELL";
    }
  }
  return "HOLD";
}

// Generate trend signals with AI enhancement
function generateTrendSignal(rsi, price, prevPrice, ema, prevEMA, aiScore, factors) {
  // Traditional crossover with AI confirmation
  const crossoverBuy = prevPrice < prevEMA && price > ema;
  const crossoverSell = prevPrice > prevEMA && price < ema;

  // AI confirmation required
  const aiConfirmation = Math.abs(aiScore) > 0.2;
  const sentimentAligned = Math.sign(factors.sentiment) === Math.sign(aiScore);

  if (crossoverBuy && aiConfirmation && aiScore > 0) {
    return rsi < 40 ? "BUY" : "HOLD";
  } else if (crossoverSell && aiConfirmation && aiScore < 0) {
    return rsi > 60 ? "SELL" : "HOLD";
  }

  return "HOLD";
}

// Dynamic mode switching logic
function updateTradingMode(closes, highs, lows, aiScore) {
  try {
    // Calculate market volatility
    const recentATR = ATR.calculate({ high: highs.slice(-20), low: lows.slice(-20), close: closes.slice(-20), period: 14 });
    const currentATR = recentATR[recentATR.length - 1] || 0;
    const avgPrice = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volatility = currentATR / avgPrice;

    // Calculate trend strength
    const emaShort = EMA.calculate({ values: closes, period: 9 });
    const emaLong = EMA.calculate({ values: closes, period: 21 });
    const shortEMA = emaShort[emaShort.length - 1];
    const longEMA = emaLong[emaLong.length - 1];
    const trendStrength = Math.abs(shortEMA - longEMA) / longEMA;

    // Mode switching logic
    if (volatility > 0.02 && trendStrength < 0.01) {
      // High volatility, weak trend -> Scalping mode
      currentMode = TRADING_MODES.SCALPING;
    } else if (trendStrength > 0.02 && volatility < 0.015) {
      // Strong trend, low volatility -> Trend mode
      currentMode = TRADING_MODES.TREND;
    }
    // Otherwise keep current mode

  } catch (error) {
    // Keep current mode on error
  }
}

// Trend direction for multi-timeframe (enhanced with AI)
function trendDirection(closes) {
  // Ensure enough data for EMA calculation
  if (closes.length < 50) {
    return "UNKNOWN";
  }

  try {
    const emaShort = EMA.calculate({ values: closes, period: 20 });
    const emaLong = EMA.calculate({ values: closes, period: 50 });

    // Ensure EMAs are calculated
    if (emaShort.length === 0 || emaLong.length === 0) {
      return "UNKNOWN";
    }

    const shortEMA = emaShort[emaShort.length - 1];
    const longEMA = emaLong[emaLong.length - 1];

    // Add trend strength indicator
    const trendStrength = Math.abs(shortEMA - longEMA) / longEMA;

    if (trendStrength < 0.005) {
      return "SIDEWAYS";
    }

    return shortEMA > longEMA ? "UP" : "DOWN";
  } catch (error) {
    return "UNKNOWN";
  }
}

// Get current trading mode
function getCurrentMode() {
  return currentMode;
}

// Set trading mode manually
function setTradingMode(mode) {
  if (Object.values(TRADING_MODES).includes(mode)) {
    currentMode = mode;
    return true;
  }
  return false;
}

module.exports = { analyze, trendDirection, getCurrentMode, setTradingMode, TRADING_MODES };