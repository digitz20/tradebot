const { getBalance, placeMarket, getMarketPrice } = require('./bitgetClient');

async function testApiCalls() {
    // Test getBalance
    let crossedMaxAvailable = 0;
    try {
        console.log("Attempting to get balance from demo account...");
        const balances = await getBalance();
        console.log("Demo account balances:", JSON.stringify(balances, null, 2));
        const usdtBalance = balances.find(b => b.marginCoin === "USDT");
        if (usdtBalance) {
            crossedMaxAvailable = parseFloat(usdtBalance.crossedMaxAvailable);
            console.log(`Crossed Max Available USDT: ${crossedMaxAvailable}`);
        } else {
            console.error("USDT balance not found.");
            return;
        }
    } catch (err) {
        console.error("Error getting balance:", err.message);
        if (err.response) {
            console.error("Response data:", err.response.data);
            console.error("Response status:", err.response.status);
            console.error("Response headers:", err.response.headers);
        }
        return; // Stop if getBalance fails
    }

    // Get current market price for BTCUSDT
    let currentPrice = 0;
    try {
        console.log("\nAttempting to get current market price for BTCUSDT...");
        currentPrice = await getMarketPrice("BTCUSDT");
        console.log(`Current BTCUSDT price: ${currentPrice}`);
    } catch (err) {
        console.error("Error getting market price:", err.message);
        if (err.response) {
            console.error("Response data:", err.response.data);
            console.error("Response status:", err.response.status);
            console.error("Response headers:", err.response.headers);
        }
        return; // Stop if getMarketPrice fails
    }

    // Calculate order size
    // We'll aim to use a small fraction of the available balance to ensure the trade goes through.
    // Let's target a notional value of 5 USDT, which is the minimum.
    const targetNotionalValue = 5; // USDT
    let calculatedSize = targetNotionalValue / currentPrice;

    // Bitget often has minimum order quantities for the base asset.
    // For BTCUSDT, the minimum is often 0.0001 or 0.001. Let's assume 0.0001 for now.
    // We'll round up to ensure we meet the minimum if our calculation is too small.
    // Or, if the calculated size is too small, we'll use the minimum.
    const minBaseAssetSize = 0.0001; // Example minimum for BTC
    if (calculatedSize < minBaseAssetSize) {
        calculatedSize = minBaseAssetSize;
    }

    // Ensure we don't exceed available balance with the calculated size
    // This is a rough check, as leverage also plays a role in futures.
    // For simplicity, we'll ensure the notional value doesn't exceed our available margin significantly.
    if ((calculatedSize * currentPrice) > crossedMaxAvailable) {
        console.warn("Calculated size's notional value exceeds crossedMaxAvailable. Adjusting size.");
        calculatedSize = (crossedMaxAvailable * 0.9) / currentPrice; // Use 90% of available margin
        if (calculatedSize < minBaseAssetSize) {
            calculatedSize = minBaseAssetSize; // Ensure it still meets minimum
        }
    }

    console.log(`Calculated order size (BTC): ${calculatedSize.toFixed(8)}`);
    console.log(`Estimated notional value (USDT): ${(calculatedSize * currentPrice).toFixed(2)}`);


    // Test placeMarket
    try {
        console.log("\nAttempting to place market order on demo account...");
        const order = await placeMarket("BTCUSDT", "buy", calculatedSize.toFixed(8));
        console.log("Market order placed successfully:", order);
    } catch (err) {
        console.error("Error placing market order:", err.message);
            if (err.response) {
                console.error("Response data:", err.response.data);
                console.error("Response status:", err.response.status);
                console.error("Response headers:", err.response.headers);
            }
    }
}

testApiCalls();