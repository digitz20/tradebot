require("dotenv").config();
const { log } = require("./logger");

function getPositionSize(balance, price, minTradeNum, streak=0) {
  let base = balance * Number(process.env.RISK_PERCENT)/100;
  if(streak >= 2) {
    base *= 1.5; // 50% increase for 2+ winning streak
    log(`Increasing position size by 50% due to winning streak (${streak}). New base: ${base}`);
  }
  if(streak <= -2) {
    base *= 0.5; // 50% decrease for 2+ losing streak
    log(`Decreasing position size by 50% due to losing streak (${streak}). New base: ${base}`);
  }

  // Convert base (USD) to quantity of the asset
  let quantity = base / price;

  // If calculated quantity is less than minTradeNum, adjust base to meet minTradeNum
  if (minTradeNum && quantity < minTradeNum) {
    base = minTradeNum * price;
  }
  return base;
}

function dailyLossCheck(dailyLossPercent) {
  return dailyLossPercent >= Number(process.env.DAILY_LOSS_LIMIT);
}

function maxDrawdownCheck(totalLossPercent) {
  return totalLossPercent >= Number(process.env.MAX_DRAWDOWN);
}

module.exports = { getPositionSize, dailyLossCheck, maxDrawdownCheck };