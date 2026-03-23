const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

// Proxy semua request ke Binance FAPI
app.use("/", createProxyMiddleware({
  target: "https://fapi.binance.com",
  changeOrigin: true,
  secure: true,
  pathRewrite: {
    "^/": "/", // biar tetap sama
  },
  onProxyReq: (proxyReq, req, res) => {
    // optional: set header tambahan
    proxyReq.setHeader("Origin", "https://fapi.binance.com");
  }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Proxy running on port " + PORT);
});
