const WebSocket = require('ws');
const { log } = require('./logger');

const DERIV_API_URL = 'wss://ws.derivws.com/websockets/v3?app_id=1089'; // Public app_id for testing
let ws;
let apiToken;
let nextRequestId = 0;
const pendingRequests = {};

function connect(token) {
    return new Promise((resolve, reject) => {
        apiToken = token;
        ws = new WebSocket(DERIV_API_URL);

        ws.onopen = () => {
            log('Connected to Deriv WebSocket API');
            // Authenticate once connected
            sendRequest({ authorize: apiToken }, (response) => {
                if (response.error) {
                    log(`Deriv API Authorization Error: ${response.error.message}`);
                    reject(new Error(response.error.message));
                } else {
                    log(`Deriv API Authorized: ${response.authorize.loginid}`);
                    resolve();
                }
            });
        };

        ws.onmessage = (msg) => {
            const response = JSON.parse(msg.data);
            if (pendingRequests[response.req_id]) {
                pendingRequests[response.req_id](response);
                delete pendingRequests[response.req_id];
            } else if (response.msg_type === 'tick') {
                // Handle tick data if needed, for now, we'll ignore
            } else {
                // log(`Deriv API Unhandled Message: ${JSON.stringify(response)}`);
            }
        };

        ws.onclose = () => {
            log('Disconnected from Deriv WebSocket API');
        };

        ws.onerror = (error) => {
            log(`Deriv WebSocket Error: ${error.message}`);
            reject(error);
        };
    });
}

function sendRequest(request, callback) {
    const req_id = nextRequestId++;
    request.req_id = req_id;
    pendingRequests[req_id] = callback;
    ws.send(JSON.stringify(request));
}

async function getCandles(symbol, timeframe) {
    log(`DEBUG: getCandles called for symbol: ${symbol}, timeframe: ${timeframe}`);
    // Deriv uses different timeframes and symbols.
    // Need to map our timeframes (e.g., "1m", "15m", "4H") to Deriv's (e.g., "1m", "15m", "4h")
    // And map symbols (e.g., "EURUSD") to Deriv's (e.g., "frxEURUSD")
    const derivTimeframe = timeframe.toLowerCase(); // Deriv uses '1h', '4h' etc.
    const derivSymbol = symbol; // Use the symbol directly as provided by active_symbols

    return new Promise((resolve, reject) => {
        sendRequest({
            ticks_history: derivSymbol,
            end: 'latest',
            count: 100, // Fetch 100 candles for analysis
            adjust_start_time: 1,
            style: 'candles',
            granularity: convertTimeframeToSeconds(derivTimeframe)
        }, (response) => {
            if (response.error) {
                log(`Deriv API getCandles Error for ${symbol} (${timeframe}): ${response.error.message}`);
                reject(new Error(response.error.message));
            } else if (response.candles) {
                const candles = response.candles.map(c => [
                    c.epoch * 1000, // Convert epoch to milliseconds
                    c.open,
                    c.high,
                    c.low,
                    c.close
                ]);
                resolve(candles);
            } else {
                reject(new Error('Invalid candles response from Deriv API'));
            }
        });
    });
}

function convertTimeframeToSeconds(timeframe) {
    switch (timeframe) {
        case '1m': return 60;
        case '5m': return 300;
        case '15m': return 900;
        case '30m': return 1800;
        case '1h': return 3600;
        case '2h': return 7200;
        case '4h': return 14400;
        case '8h': return 28800;
        case '1d': return 86400;
        default: return 60; // Default to 1 minute
    }
}

async function getBalance() {
    return new Promise((resolve, reject) => {
        sendRequest({ balance: 1 }, (response) => {
            if (response.error) {
                log(`Deriv API getBalance Error: ${response.error.message}`);
                reject(new Error(response.error.message));
            } else if (response.balance) {
                resolve([{
                    marginCoin: response.balance.currency,
                    available: response.balance.balance,
                    walletBalance: response.balance.balance
                }]);
            } else {
                reject(new Error('Invalid balance response from Deriv API'));
            }
        });
    });
}

async function placeMarket(symbol, side, size) {
    const derivSymbol = `frx${symbol.toUpperCase()}`; // Assuming forex
    const orderType = side === 'BUY' ? 'buy' : 'sell';

    return new Promise((resolve, reject) => {
        sendRequest({
            buy: 1, // For buy orders
            parameters: {
                amount: size, // Contract size
                basis: 'stake', // Stake amount
                contract_type: orderType === 'buy' ? 'CALL' : 'PUT', // For options, need to adjust for CFDs
                currency: 'USD', // Or account currency
                duration: 5, // Example duration in minutes, need to make this dynamic
                duration_unit: 'm',
                symbol: derivSymbol
            }
        }, (response) => {
            if (response.error) {
                log(`Deriv API placeMarket Error for ${symbol} (${side}): ${response.error.message}`);
                reject(new Error(response.error.message));
            } else if (response.buy) {
                log(`Deriv Market Order Placed: ${JSON.stringify(response.buy)}`);
                resolve(response.buy);
            } else {
                reject(new Error('Invalid market order response from Deriv API'));
            }
        });
    });
}

async function placeTpslOrder(symbol, holdSide, stopLossTriggerPrice, takeProfitTriggerPrice, pricePlace) {
    // Deriv's API for TP/SL is different, often tied to the initial contract or a separate order modification.
    // This is a placeholder and will need significant adjustment based on Deriv's CFD trading API.
    log(`Deriv API: Placeholder for placing TP/SL for ${symbol}. SL: ${stopLossTriggerPrice}, TP: ${takeProfitTriggerPrice}`);
    return Promise.resolve({ success: true, message: "TP/SL placeholder executed" });
}

async function getContractConfig() {
    return new Promise((resolve, reject) => {
        sendRequest({ active_symbols: "full" }, (response) => {
            if (response.error) {
                log(`Deriv API getContractConfig Error: ${response.error.message}`);
                reject(new Error(response.error.message));
            } else if (response.active_symbols) {
                const contractConfigs = {};
                response.active_symbols.forEach(asset => {
                    const symbol = asset.symbol;
                    const pricePlace = asset.pip_size ? -Math.log10(asset.pip_size) : 5; // Calculate pricePlace from pip_size, default to 5
                    const minTradeNum = asset.min_stake || 0.01; // Use min_stake if available, default to 0.01

                    contractConfigs[symbol] = {
                        minTradeNum: minTradeNum,
                        pricePlace: pricePlace
                    };
                });
                console.log("Deriv Contract Configurations:", contractConfigs); // Add this line
                // Write the raw active_symbols response to a file for inspection
                require('fs').writeFileSync('c:\\Users\\Tush\\Desktop\\tradingbot\\deriv_active_symbols.json', JSON.stringify(response.active_symbols, null, 2));
                log(`Deriv API Contract Configurations written to deriv_active_symbols.json`);
                resolve(contractConfigs);
            } else {
                reject(new Error('Invalid active_symbols response from Deriv API'));
            }
        });
    });
}

module.exports = { connect, getCandles, getBalance, placeMarket, placeTpslOrder, getContractConfig };