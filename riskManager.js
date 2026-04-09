require("dotenv").config();
const { log } = require("./logger");

class RiskManager {
  constructor() {
    this.winStreak = 0;
    this.lossStreak = 0;
    this.totalTrades = 0;
    this.winningTrades = 0;
    this.compoundingMultiplier = 1.0;
    this.recoveryMode = false;
    this.baseRiskPercent = Number(process.env.RISK_PERCENT) || 1.0;
    this.maxCompoundingMultiplier = 3.0; // Maximum 3x compounding
    this.recoveryReductionFactor = 0.5; // 50% reduction in recovery mode
  }

  // Enhanced position sizing with auto compounding and loss recovery
  getPositionSize(balance, price, minTradeNum, tradeResult = null, aiConfidence = 0.5) {
    // Update streaks and compounding based on trade result
    this.updateStreaksAndCompounding(tradeResult);

    // Base risk calculation
    let riskPercent = this.baseRiskPercent;

    // Apply recovery mode reduction
    if (this.recoveryMode) {
      riskPercent *= this.recoveryReductionFactor;
      log(`Recovery mode active: Reducing risk to ${riskPercent}%`);
    }

    // Apply compounding multiplier for winning streaks
    riskPercent *= this.compoundingMultiplier;

    // AI confidence adjustment
    riskPercent *= (0.8 + aiConfidence * 0.4); // 0.8x to 1.2x based on confidence

    // Cap maximum risk
    riskPercent = Math.min(riskPercent, 5.0); // Max 5% per trade

    let base = balance * riskPercent / 100;

    // Additional streak-based adjustments
    if (this.winStreak >= 3) {
      base *= 1.5; // Additional 50% increase for 3+ win streak
      log(`Extended winning streak (${this.winStreak}): Increasing position by additional 50%`);
    }

    if (this.lossStreak >= 2) {
      base *= 0.7; // Additional 30% reduction for 2+ loss streak
      log(`Extended losing streak (${this.lossStreak}): Reducing position by additional 30%`);
    }

    // Convert base (USD) to quantity of the asset
    let quantity = base / price;

    // If calculated quantity is less than minTradeNum, adjust base to meet minTradeNum
    if (minTradeNum && quantity < minTradeNum) {
      base = minTradeNum * price;
      log(`Adjusted base to meet minimum trade number: ${base}`);
    }

    return base;
  }

  // Update win/loss streaks and compounding logic
  updateStreaksAndCompounding(tradeResult) {
    if (tradeResult === null) return;

    this.totalTrades++;

    if (tradeResult === 'win') {
      this.winningTrades++;
      this.winStreak++;
      this.lossStreak = 0;

      // Auto compounding: increase multiplier for consistent wins
      if (this.winStreak >= 2) {
        this.compoundingMultiplier = Math.min(
          this.compoundingMultiplier * 1.2, // 20% increase per win
          this.maxCompoundingMultiplier
        );
        log(`Auto compounding activated: Multiplier now ${this.compoundingMultiplier.toFixed(2)}x`);
      }

      // Exit recovery mode after a win
      if (this.recoveryMode && this.winStreak >= 1) {
        this.recoveryMode = false;
        log(`Exiting recovery mode after winning trade`);
      }

    } else if (tradeResult === 'loss') {
      this.winStreak = 0;
      this.lossStreak++;

      // Loss recovery logic
      if (this.lossStreak >= 2) {
        this.recoveryMode = true;
        this.compoundingMultiplier = Math.max(
          this.compoundingMultiplier * 0.8, // Reduce compounding on losses
          0.5 // Minimum 0.5x
        );
        log(`Loss recovery activated: Entering recovery mode, compounding reduced to ${this.compoundingMultiplier.toFixed(2)}x`);
      }
    }
  }

  // Get current risk metrics
  getRiskMetrics() {
    const winRate = this.totalTrades > 0 ? (this.winningTrades / this.totalTrades) * 100 : 0;

    return {
      winStreak: this.winStreak,
      lossStreak: this.lossStreak,
      totalTrades: this.totalTrades,
      winRate: winRate.toFixed(2),
      compoundingMultiplier: this.compoundingMultiplier.toFixed(2),
      recoveryMode: this.recoveryMode,
      effectiveRiskPercent: (this.baseRiskPercent * this.compoundingMultiplier * (this.recoveryMode ? this.recoveryReductionFactor : 1)).toFixed(2)
    };
  }

  // Reset compounding (can be called manually or periodically)
  resetCompounding() {
    this.compoundingMultiplier = 1.0;
    log(`Compounding multiplier reset to 1.0x`);
  }

  // Force exit recovery mode
  exitRecoveryMode() {
    this.recoveryMode = false;
    log(`Manually exiting recovery mode`);
  }
}

// Legacy function for backward compatibility
function getPositionSize(balance, price, minTradeNum, streak = 0) {
  const riskManager = new RiskManager();
  // Convert old streak parameter to trade result
  let tradeResult = null;
  if (streak > 0) tradeResult = 'win';
  else if (streak < 0) tradeResult = 'loss';

  return riskManager.getPositionSize(balance, price, minTradeNum, tradeResult);
}

function dailyLossCheck(dailyLossPercent) {
  return dailyLossPercent >= Number(process.env.DAILY_LOSS_LIMIT);
}

function maxDrawdownCheck(totalLossPercent) {
  return totalLossPercent >= Number(process.env.MAX_DRAWDOWN);
}

module.exports = { getPositionSize, dailyLossCheck, maxDrawdownCheck, RiskManager };