const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = process.env.TARGET || 'https://abema.tv';

// ==============================
// Free Public Proxy Support
// ==============================

// Manual proxy list (優先度高)
// 例: http://1.2.3.4:8080 または socks5://1.2.3.4:1080
const MANUAL_PROXIES = (process.env.PROXY_LIST || '')
  .split(',')
  .map(p => p.trim())
  .filter(Boolean);

// 自動取得する無料プロキシソース（日本優先）
const PROXY_SOURCES = [
  // ProxyScrape - Japan HTTP
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=JP&ssl=all&anonymity=all',
  // ProxyScrape - Japan SOCKS5
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=5000&country=JP&ssl=all&anonymity=all',
  // GeoNode free (Japan)
  'https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc&country=JP',
];

let proxyList = [...MANUAL_PROXIES];
let currentProxyIndex = 0;
let lastFetchTime = 0;
const FETCH_INTERVAL = 10 * 60 * 1000; // 10分ごとに再取得

/**
 * 無料プロキシを取得してリストを更新
 */
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

      // JSON形式（GeoNodeなど）
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
        // テキスト形式（1行1プロキシ）
        text.split('\n').forEach(line => {
          line = line.trim();
          if (line && line.includes(':')) {
            // すでに protocol:// が付いている場合とそのままの場合を処理
            if (line.startsWith('http') || line.startsWith('socks')) {
              newProxies.push(line);
            } else {
              // デフォルトで http として扱う
              newProxies.push(`http://${line}`);
            }
          }
        });
      }
    } catch (err) {
      console.warn(`Failed to fetch from ${url}:`, err.message);
    }
  }

  // 重複除去
  proxyList = [...new Set(newProxies)];
  lastFetchTime = now;
  currentProxyIndex = 0;

  console.log(`Loaded ${proxyList.length} proxies`);
}

/**
 * 次のプロキシを取得（ラウンドロビン）
 */
function getNextProxy() {
  if (proxyList.length === 0) return null;
  const proxy = proxyList[currentProxyIndex % proxyList.length];
  currentProxyIndex++;
  return proxy;
}

/**
 * プロキシURLからAgentを作成
 */
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

// 起動時にプロキシを取得
fetchFreeProxies().catch(console.error);

// 定期的に更新
setInterval(() => {
  fetchFreeProxies().catch(console.error);
}, FETCH_INTERVAL);

// ==============================
// Proxy Middleware
// ==============================

app.use('/', (req, res, next) => {
  // リクエストごとにプロキシを切り替える（失敗時の耐性を上げる）
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
    headers: {
      host: 'abema.tv'
    },
    onProxyReq: (proxyReq) => {
      proxyReq.setHeader('Host', 'abema.tv');
    },
    onError: (err, req, res) => {
      console.error('Proxy error:', err.message);
      // エラー時は次のプロキシを試すためにリストから除外するなど、拡張可能
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
    target: TARGET,
    lastFetch: lastFetchTime ? new Date(lastFetchTime).toISOString() : null,
    timestamp: new Date().toISOString()
  });
});

// プロキシ一覧確認用（デバッグ）
app.get('/proxies', (req, res) => {
  res.json({
    count: proxyList.length,
    proxies: proxyList.map(p => p.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@'))
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ABEMA reverse proxy (free public proxy mode) running on port ${PORT}`);
  console.log(`Target: ${TARGET}`);
});
