import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());

const instance = axios.create({
  baseURL: "https://fapi.binance.com",
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json"
  }
});

// 🔁 RETRY SYSTEM (anti fail)
async function safeRequest(fn, retries = 3) {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      console.warn("Retry...");
      return safeRequest(fn, retries - 1);
    }
    throw err;
  }
}

// 🔥 TOP PAIRS FUTURES
app.get("/api/top-pairs", async (req, res) => {
  try {
    const response = await safeRequest(() =>
      instance.get("/fapi/v1/ticker/24hr")
    );

    const data = response.data
      .filter(t => t.symbol.endsWith("USDT"))
      .map(t => ({
        symbol: t.symbol,
        price: +t.lastPrice,
        change: +t.priceChangePercent,
        volume: +t.quoteVolume
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 50);

    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: "Gagal ambil futures data",
      detail: err.message
    });
  }
});

// 🔥 KLINES FUTURES
app.get("/api/klines", async (req, res) => {
  try {
    const { symbol = "BTCUSDT", interval = "1m", limit = 100 } = req.query;

    const response = await safeRequest(() =>
      instance.get("/fapi/v1/klines", {
        params: { symbol, interval, limit }
      })
    );

    const data = response.data.map(c => ({
      time: c[0],
      open: +c[1],
      high: +c[2],
      low: +c[3],
      close: +c[4],
      volume: +c[5]
    }));

    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: "Gagal ambil klines futures",
      detail: err.message
    });
  }
});

// 🔥 EXCHANGE INFO
app.get("/api/exchange-info", async (req, res) => {
  try {
    const response = await safeRequest(() =>
      instance.get("/fapi/v1/exchangeInfo")
    );

    res.json(response.data);
  } catch (err) {
    res.status(500).json({
      error: "Gagal ambil exchange info",
      detail: err.message
    });
  }
});

// ROOT
app.get("/", (req, res) => {
  res.send("🚀 Binance Futures Proxy Aktif");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server jalan di port", PORT);
});
