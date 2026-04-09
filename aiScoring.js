const { RSI, EMA, ATR, MACD, BollingerBands, Stochastic } = require("technicalindicators");
const { log } = require("./logger");

// AI Scoring System - Advanced multi-factor analysis
class AIScoringSystem {
  constructor() {
    this.weights = {
      technical: 0.4,
      momentum: 0.25,
      volatility: 0.2,
      volume: 0.15
    };
  }

  // Calculate comprehensive AI score for trading signals
  calculateAIScore(candles, newsSentiment, volumeData = null) {
    try {
      if (!candles || candles.length < 50) {
        return { score: 0, confidence: 0, factors: {} };
      }

      const closes = candles.map(c => Number(c[4]));
      const highs = candles.map(c => Number(c[2]));
      const lows = candles.map(c => Number(c[3]));
      const volumes = volumeData || candles.map(c => Number(c[5]) || 1);

      // Technical Analysis Score
      const technicalScore = this.calculateTechnicalScore(closes, highs, lows);

      // Momentum Score
      const momentumScore = this.calculateMomentumScore(closes);

      // Volatility Score
      const volatilityScore = this.calculateVolatilityScore(closes, highs, lows);

      // Volume Score
      const volumeScore = this.calculateVolumeScore(volumes, closes);

      // News Sentiment Integration (scaled)
      const sentimentScore = Math.max(-1, Math.min(1, newsSentiment / 5)) * 0.3;

      // Weighted final score
      const finalScore = (
        technicalScore * this.weights.technical +
        momentumScore * this.weights.momentum +
        volatilityScore * this.weights.volatility +
        volumeScore * this.weights.volume +
        sentimentScore
      );

      // Confidence based on score consistency and magnitude
      const confidence = this.calculateConfidence(finalScore, {
        technicalScore,
        momentumScore,
        volatilityScore,
        volumeScore,
        sentimentScore
      });

      return {
        score: Math.max(-1, Math.min(1, finalScore)),
        confidence,
        factors: {
          technical: technicalScore,
          momentum: momentumScore,
          volatility: volatilityScore,
          volume: volumeScore,
          sentiment: sentimentScore
        }
      };
    } catch (error) {
      log(`Error calculating AI score: ${error.message}`);
      return { score: 0, confidence: 0, factors: {} };
    }
  }

  calculateTechnicalScore(closes, highs, lows) {
    try {
      // RSI Score (-1 to 1)
      const rsi = RSI.calculate({ values: closes, period: 14 });
      const lastRSI = rsi[rsi.length - 1] || 50;
      const rsiScore = (lastRSI - 50) / 50; // -1 (oversold) to 1 (overbought)

      // EMA Trend Score
      const emaShort = EMA.calculate({ values: closes, period: 9 });
      const emaLong = EMA.calculate({ values: closes, period: 21 });
      const shortEMA = emaShort[emaShort.length - 1] || closes[closes.length - 1];
      const longEMA = emaLong[emaLong.length - 1] || closes[closes.length - 1];
      const emaScore = (shortEMA - longEMA) / longEMA;

      // MACD Score
      const macd = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });
      const lastMACD = macd[macd.length - 1];
      const macdScore = lastMACD ? (lastMACD.MACD - lastMACD.signal) / Math.abs(lastMACD.signal || 1) : 0;

      return (rsiScore * 0.3 + emaScore * 0.4 + macdScore * 0.3);
    } catch (error) {
      return 0;
    }
  }

  calculateMomentumScore(closes) {
    try {
      // Rate of Change (ROC)
      const roc = closes.slice(-10).map((price, i, arr) =>
        i > 0 ? (price - arr[i-1]) / arr[i-1] : 0
      );
      const avgROC = roc.reduce((a, b) => a + b, 0) / roc.length;

      // Stochastic Oscillator
      const stochastic = Stochastic.calculate({
        high: closes.map(c => c * 1.001), // Approximate highs
        low: closes.map(c => c * 0.999),  // Approximate lows
        close: closes,
        period: 14,
        signalPeriod: 3
      });
      const lastStoch = stochastic[stochastic.length - 1];
      const stochScore = lastStoch ? (lastStoch.k - 50) / 50 : 0;

      return (avgROC * 0.6 + stochScore * 0.4);
    } catch (error) {
      return 0;
    }
  }

  calculateVolatilityScore(closes, highs, lows) {
    try {
      // ATR Score
      const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
      const lastATR = atr[atr.length - 1] || 0;
      const avgPrice = closes.reduce((a, b) => a + b, 0) / closes.length;
      const atrScore = lastATR / avgPrice; // Normalized ATR

      // Bollinger Band Position
      const bb = BollingerBands.calculate({
        values: closes,
        period: 20,
        stdDev: 2
      });
      const lastBB = bb[bb.length - 1];
      const lastPrice = closes[closes.length - 1];
      const bbPosition = lastBB ? (lastPrice - lastBB.lower) / (lastBB.upper - lastBB.lower) : 0.5;
      const bbScore = (bbPosition - 0.5) * 2; // -1 to 1

      return (atrScore * 0.4 + bbScore * 0.6);
    } catch (error) {
      return 0;
    }
  }

  calculateVolumeScore(volumes, closes) {
    try {
      // Volume Trend
      const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const volumeTrend = (recentVolume - avgVolume) / avgVolume;

      // Price-Volume Relationship
      const priceChange = (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2];
      const volumeChange = (volumes[volumes.length - 1] - volumes[volumes.length - 2]) / volumes[volumes.length - 2];
      const pvCorrelation = priceChange * volumeChange > 0 ? 1 : -1;

      return (volumeTrend * 0.5 + pvCorrelation * 0.5);
    } catch (error) {
      return 0;
    }
  }

  calculateConfidence(finalScore, factors) {
    // Higher confidence when factors are aligned and score is strong
    const factorAlignment = Object.values(factors).reduce((acc, factor, i, arr) => {
      const aligned = arr.filter(f => Math.sign(f) === Math.sign(factor)).length / arr.length;
      return acc + aligned;
    }, 0) / Object.keys(factors).length;

    const scoreMagnitude = Math.abs(finalScore);
    return Math.min(1, (factorAlignment * 0.7 + scoreMagnitude * 0.3));
  }

  // Detect fake breakouts using multiple confirmation signals
  detectFakeBreakout(candles, signal) {
    try {
      if (!candles || candles.length < 20) return false;

      const closes = candles.map(c => Number(c[4]));
      const highs = candles.map(c => Number(c[2]));
      const lows = candles.map(c => Number(c[3]));
      const volumes = candles.map(c => Number(c[5]) || 1);

      // Check for volume confirmation
      const recentVolume = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const avgVolume = volumes.slice(0, -3).reduce((a, b) => a + b, 0) / (volumes.length - 3);
      const volumeConfirmation = recentVolume > avgVolume * 1.2;

      // Check for sustained momentum
      const recentPrices = closes.slice(-5);
      const trend = signal === 'BUY' ?
        recentPrices.every((price, i) => i === 0 || price >= recentPrices[i-1]) :
        recentPrices.every((price, i) => i === 0 || price <= recentPrices[i-1]);

      // Check for resistance/support levels
      const lastPrice = closes[closes.length - 1];
      const recentHigh = Math.max(...highs.slice(-10));
      const recentLow = Math.min(...lows.slice(-10));

      const nearResistance = signal === 'BUY' && lastPrice > recentHigh * 0.98;
      const nearSupport = signal === 'SELL' && lastPrice < recentLow * 1.02;

      // Fake breakout indicators
      const fakeIndicators = [
        !volumeConfirmation, // Low volume breakout
        !trend, // No sustained momentum
        nearResistance || nearSupport, // Near key levels
      ];

      return fakeIndicators.filter(Boolean).length >= 2; // Multiple fake indicators
    } catch (error) {
      log(`Error detecting fake breakout: ${error.message}`);
      return false;
    }
  }
}

module.exports = { AIScoringSystem };