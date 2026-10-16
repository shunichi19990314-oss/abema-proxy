const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = 'https://abema.tv';

// すべてのリクエストをABEMAにプロキシ
app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  secure: true,
  followRedirects: true,
  // WebSocket対応（必要に応じて）
  ws: true,
  // ヘッダー調整（必要に応じてカスタム）
  onProxyReq: (proxyReq, req, res) => {
    // 元のHostを消してターゲットのHostを使う
    proxyReq.setHeader('Host', 'abema.tv');
    // 必要に応じてUser-Agentなどを調整
    // proxyReq.setHeader('User-Agent', 'Mozilla/5.0 ...');
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message);
    res.status(500).send('Proxy Error');
  }
}));

app.listen(PORT, () => {
  console.log(`ABEMA reverse proxy running on port ${PORT}`);
});
