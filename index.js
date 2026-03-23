import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());

// 🔧 Axios Instance
const instance = axios.create({
  baseURL: "https://fapi.binance.com",
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json"
  }
});

// 🔁 RETRY SYSTEM
async function safeRequest(fn, retries = 3) {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      console.warn("⚠️ Retry...");
      return safeRequest(fn, retries - 1);
    }
    throw err;
  }
}

// 🗄️ CACHE VARIABLES
let exchangeInfoCache = null;
let exchangeInfoTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 menit

// 🔥 HELPER FUNCTIONS

async function getExchangeInfo() {
  const now = Date.now();
  if (exchangeInfoCache && (now - exchangeInfoTimestamp) < CACHE_DURATION) {
    return exchangeInfoCache;
  }

  try {
    const res = await safeRequest(() =>
      instance.get('/fapi/v1/exchangeInfo')
    );
    
    const symbols = res.data.symbols
      .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
      .map(s => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        pricePrecision: s.pricePrecision,
        quantityPrecision: s.quantityPrecision
      }));
    
    exchangeInfoCache = symbols;
    exchangeInfoTimestamp = now;
    return symbols;
  } catch (error) {
    console.error('❌ Failed to get exchange info:', error.message);
    throw error;
  }
}

async function getKlines(symbol, interval, limit = 200) {
  const res = await safeRequest(() =>
    instance.get('/fapi/v1/klines', {
      params: { symbol, interval, limit }
    })
  );
  
  return res.data.map(candle => ({
    time: candle[0],
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5]),
    closeTime: candle[6],
    quoteVolume: parseFloat(candle[7]),
    trades: candle[8]
  }));
}

async function getTicker24h(symbol = null) {
  const params = symbol ? { symbol } : {};
  const res = await safeRequest(() =>
    instance.get('/fapi/v1/ticker/24hr', { params })
  );
  
  if (Array.isArray(res.data)) {
    return res.data
      .filter(t => t.symbol.endsWith('USDT'))
      .map(t => ({
        symbol: t.symbol,
        priceChange: parseFloat(t.priceChange),
        priceChangePercent: parseFloat(t.priceChangePercent),
        lastPrice: parseFloat(t.lastPrice),
        volume: parseFloat(t.volume),
        quoteVolume: parseFloat(t.quoteVolume),
        highPrice: parseFloat(t.highPrice),
        lowPrice: parseFloat(t.lowPrice)
      }))
      .sort((a, b) => b.quoteVolume - a.quoteVolume);
  }
  
  return {
    symbol: res.data.symbol,
    priceChange: parseFloat(res.data.priceChange),
    priceChangePercent: parseFloat(res.data.priceChangePercent),
    lastPrice: parseFloat(res.data.lastPrice),
    volume: parseFloat(res.data.volume),
    quoteVolume: parseFloat(res.data.quoteVolume),
    highPrice: parseFloat(res.data.highPrice),
    lowPrice: parseFloat(res.data.lowPrice)
  };
}

async function getTopLiquidPairs(limit = 50) {
  const tickers = await getTicker24h();
  return tickers.slice(0, limit);
}

// 🪞 MIRROR/PROXY HANDLER (dinamis untuk semua endpoint Binance Futures)
async function mirrorBinance(req, res, next) {
  try {
    // Ambil path setelah /fapi/... dan forward ke Binance
    const binancePath = req.originalUrl.split('?')[0]; // hapus query string untuk path
    const queryString = req.originalUrl.split('?')[1] || '';
    
    const response = await safeRequest(() =>
      instance.request({
        method: req.method,
        url: `${binancePath}${queryString ? '?' + queryString : ''}`,
        params: req.query,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        }
      })
    );

    // Forward status code dan response dari Binance
    res.status(response.status).json(response.data);
  } catch (err) {
    console.error('❌ Mirror error:', err.message);
    
    // Forward error dari Binance jika ada response
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    
    res.status(500).json({
      error: "Proxy error",
      detail: err.message
    });
  }
}

// 🚀 EXPRESS ROUTES

// 🔥 CUSTOM ENDPOINTS (tetap ada untuk convenience)
app.get("/api/top-pairs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const data = await getTopLiquidPairs(limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil futures data", detail: err.message });
  }
});

app.get("/api/klines", async (req, res) => {
  try {
    const { symbol = "BTCUSDT", interval = "1m", limit = 100 } = req.query;
    const data = await getKlines(symbol, interval, parseInt(limit));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil klines futures", detail: err.message });
  }
});

app.get("/api/exchange-info", async (req, res) => {
  try {
    const data = await getExchangeInfo();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil exchange info", detail: err.message });
  }
});

app.get("/api/ticker", async (req, res) => {
  try {
    const { symbol } = req.query;
    const data = await getTicker24h(symbol || null);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil ticker data", detail: err.message });
  }
});

// 🪞 MIRROR ROUTES - Forward semua request /fapi/* ke Binance Futures API
// Support GET, POST, PUT, DELETE sesuai kebutuhan endpoint Binance
app.all("/fapi/*", mirrorBinance);

// Opsional: Mirror endpoint dapi (delivery futures) jika dibutuhkan
// app.all("/dapi/*", mirrorBinance); 

// ROOT
app.get("/", (req, res) => {
  res.json({
    status: "🚀 Binance Futures Proxy Aktif",
    endpoints: {
      custom: [
        "GET /api/top-pairs",
        "GET /api/klines",
        "GET /api/exchange-info",
        "GET /api/ticker"
      ],
      mirror: [
        "GET /fapi/v1/exchangeInfo",
        "GET /fapi/v1/klines",
        "GET /fapi/v1/ticker/24hr",
        "GET /fapi/v1/depth",
        "GET /fapi/v1/trades",
        "POST /fapi/v1/order",
        "... dan semua endpoint Binance Futures lainnya"
      ]
    }
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server jalan di port ${PORT}`);
});
