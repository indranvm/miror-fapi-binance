import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use("/", createProxyMiddleware({
  target: "https://fapi.binance.com",
  changeOrigin: true,
  secure: true,
  headers: {
    "X-Forwarded-For": "103.28.248.1", // IP Asia/ID
    "CF-Connecting-IP": "103.28.248.1",
    "X-Real-IP": "103.28.248.1",
  },
  onProxyReq: (proxyReq) => {
    proxyReq.setHeader("Origin", "https://fapi.binance.com");
    proxyReq.setHeader("Referer", "https://fapi.binance.com");
    proxyReq.setHeader("X-Forwarded-For", "103.28.248.1");
  }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Proxy running on port " + PORT));
