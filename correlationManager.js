// Very simple example: assume BTC/ETH negative correlation check
function isCorrelatedSafe(activePairs, newPair) {
  // Prevent trading two pairs with negative correlation at same time
  if(activePairs.includes("BTCUSDT") && newPair==="ETHUSDT") return false;
  return true;
}

module.exports = { isCorrelatedSafe };