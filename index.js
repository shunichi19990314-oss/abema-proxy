const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = process.env.TARGET || 'https://abema.tv';

// Upstream Japanese proxy (optional)
// Examples:
//   http://user:pass@jp-proxy.example.com:8080
//   socks5://user:pass@jp-proxy.example.com:1080
const UPSTREAM_PROXY = process.env.UPSTREAM_PROXY;

let agent = undefined;

if (UPSTREAM_PROXY) {
  try {
    if (UPSTREAM_PROXY.startsWith('socks')) {
      agent = new SocksProxyAgent(UPSTREAM_PROXY);
      console.log('Using SOCKS upstream proxy');
    } else {
      agent = new HttpsProxyAgent(UPSTREAM_PROXY);
      console.log('Using HTTP(S) upstream proxy');
    }
    // Hide password in log
    const safeProxy = UPSTREAM_PROXY.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
    console.log('Proxy:', safeProxy);
  } catch (err) {
    console.error('Failed to create upstream proxy agent:', err.message);
  }
} else {
  console.log('No UPSTREAM_PROXY set. Direct connection will be used (may be geo-blocked).');
}

app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  secure: true,
  followRedirects: true,
  ws: true,
  agent: agent,
  headers: {
    host: 'abema.tv'
  },
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('Host', 'abema.tv');
    // Optional: spoof common Japanese browser UA
    // proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).send('Bad Gateway: ' + err.message);
    }
  }
}));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    upstreamProxy: !!UPSTREAM_PROXY,
    target: TARGET,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ABEMA reverse proxy running on port ${PORT}`);
  console.log(`Target: ${TARGET}`);
});
