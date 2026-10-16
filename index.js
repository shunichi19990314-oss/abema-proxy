const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = process.env.TARGET || 'https://abema.tv';

// ==============================
// Header Spoofing Settings
// ==============================
// 日本の適当なIPをデフォルトで設定（効果は限定的です）
const SPOOF_IP = process.env.SPOOF_IP || '126.0.0.1'; // 日本のIP帯の例
const SPOOF_COUNTRY = process.env.SPOOF_COUNTRY || 'JP';
const SPOOF_UA = process.env.SPOOF_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

// ==============================
// Free Public Proxy Support
// ==============================

const MANUAL_PROXIES = (process.env.PROXY_LIST || '')
  .split(',')
  .map(p => p.trim())
  .filter(Boolean);

const PROXY_SOURCES = [
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=JP&ssl=all&anonymity=all',
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=5000&country=JP&ssl=all&anonymity=all',
  'https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc&country=JP',
];

let proxyList = [...MANUAL_PROXIES];
let currentProxyIndex = 0;
let lastFetchTime = 0;
const FETCH_INTERVAL = 10 * 60 * 1000;

async function fetchFreeProxies() {
  const now = Date.now();
  if (now - lastFetchTime < FETCH_INTERVAL && proxyList.length > 0) {
    return;
  }

  console.log('Fetching free proxies...');
  const newProxies = [...MANUAL_PROXIES];

  for (const url of PROXY_SOURCES) {
    try {
      const res = await fetch(url, { timeout: 8000 });
      const text = await res.text();

      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          const data = JSON.parse(text);
          const list = data.data || data;
          if (Array.isArray(list)) {
            list.forEach(p => {
              if (p.ip && p.port) {
                const protocol = (p.protocols && p.protocols[0]) || 'http';
                newProxies.push(`${protocol}://${p.ip}:${p.port}`);
              }
            });
          }
        } catch (e) {}
      } else {
        text.split('\n').forEach(line => {
          line = line.trim();
          if (line && line.includes(':')) {
            if (line.startsWith('http') || line.startsWith('socks')) {
              newProxies.push(line);
            } else {
              newProxies.push(`http://${line}`);
            }
          }
        });
      }
    } catch (err) {
      console.warn(`Failed to fetch from ${url}:`, err.message);
    }
  }

  proxyList = [...new Set(newProxies)];
  lastFetchTime = now;
  currentProxyIndex = 0;
  console.log(`Loaded ${proxyList.length} proxies`);
}

function getNextProxy() {
  if (proxyList.length === 0) return null;
  const proxy = proxyList[currentProxyIndex % proxyList.length];
  currentProxyIndex++;
  return proxy;
}

function createAgent(proxyUrl) {
  if (!proxyUrl) return undefined;
  try {
    if (proxyUrl.startsWith('socks')) {
      return new SocksProxyAgent(proxyUrl);
    }
    return new HttpsProxyAgent(proxyUrl);
  } catch (err) {
    console.error('Failed to create agent for', proxyUrl, err.message);
    return undefined;
  }
}

fetchFreeProxies().catch(console.error);
setInterval(() => {
  fetchFreeProxies().catch(console.error);
}, FETCH_INTERVAL);

// ==============================
// Proxy Middleware with Header Spoofing
// ==============================

app.use('/', (req, res, next) => {
  const proxyUrl = getNextProxy();
  const agent = createAgent(proxyUrl);

  if (proxyUrl) {
    console.log(`[${new Date().toISOString()}] Using proxy: ${proxyUrl.replace(/:\/\/.*@/, '://***@')}`);
  } else {
    console.log(`[${new Date().toISOString()}] No proxy available, direct connection`);
  }

  const middleware = createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    secure: true,
    followRedirects: true,
    ws: true,
    agent: agent,
    onProxyReq: (proxyReq, req, res) => {
      // ===== Header Spoofing =====
      proxyReq.setHeader('Host', 'abema.tv');

      // IP関連ヘッダーを日本IPで上書き
      proxyReq.setHeader('X-Forwarded-For', SPOOF_IP);
      proxyReq.setHeader('X-Real-IP', SPOOF_IP);
      proxyReq.setHeader('X-Client-IP', SPOOF_IP);
      proxyReq.setHeader('CF-Connecting-IP', SPOOF_IP);
      proxyReq.setHeader('True-Client-IP', SPOOF_IP);
      proxyReq.setHeader('X-Originating-IP', SPOOF_IP);
      proxyReq.setHeader('X-Remote-IP', SPOOF_IP);
      proxyReq.setHeader('X-Remote-Addr', SPOOF_IP);

      // その他のよく使われるヘッダー
      proxyReq.setHeader('X-Forwarded-Proto', 'https');
      proxyReq.setHeader('X-Forwarded-Host', 'abema.tv');
      proxyReq.setHeader('X-Forwarded-Port', '443');

      // User-Agent
      proxyReq.setHeader('User-Agent', SPOOF_UA);

      // Accept-Language を日本語優先に
      proxyReq.setHeader('Accept-Language', 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7');

      // 国コード系（一部のサービスで使われる）
      proxyReq.setHeader('CF-IPCountry', SPOOF_COUNTRY);
      proxyReq.setHeader('X-Country-Code', SPOOF_COUNTRY);
      proxyReq.setHeader('CloudFront-Viewer-Country', SPOOF_COUNTRY);
    },
    onError: (err, req, res) => {
      console.error('Proxy error:', err.message);
      if (!res.headersSent) {
        res.status(502).send('Bad Gateway: ' + err.message);
      }
    }
  });

  return middleware(req, res, next);
});

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    proxyCount: proxyList.length,
    currentProxyIndex,
    spoofIp: SPOOF_IP,
    spoofCountry: SPOOF_COUNTRY,
    target: TARGET,
    lastFetch: lastFetchTime ? new Date(lastFetchTime).toISOString() : null,
    timestamp: new Date().toISOString()
  });
});

// プロキシ一覧
app.get('/proxies', (req, res) => {
  res.json({
    count: proxyList.length,
    proxies: proxyList.map(p => p.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@'))
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ABEMA reverse proxy running on port ${PORT}`);
  console.log(`Target: ${TARGET}`);
  console.log(`Spoof IP: ${SPOOF_IP} (${SPOOF_COUNTRY})`);
});
