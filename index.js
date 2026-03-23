import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

// CORS (optional)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

app.use("/", createProxyMiddleware({
  target: "https://fapi.binance.com",
  changeOrigin: true,
  secure: true,
  onProxyReq: (proxyReq) => {
    proxyReq.setHeader("Origin", "https://fapi.binance.com");
  }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Proxy running on port " + PORT);
});
