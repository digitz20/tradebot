require("dotenv").config();

function getPositionSize(balance, price, minTradeNum, streak=0) {
  let base = balance * Number(process.env.RISK_PERCENT)/100;
  if(streak >= 3) base *= 1.2;
  if(streak <= -2) base *= 0.5;

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