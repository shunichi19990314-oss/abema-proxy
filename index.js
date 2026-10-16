const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = process.env.TARGET || 'https://abema.tv';

// ==============================
// Settings
// ==============================
const SPOOF_IP = process.env.SPOOF_IP || '126.0.0.1';
const SPOOF_COUNTRY = process.env.SPOOF_COUNTRY || 'JP';
const SPOOF_UA = process.env.SPOOF_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

// 手動で指定するプロキシ（カンマ区切り）
// 例: PROXY_LIST=http://1.2.3.4:8080,socks5://5.6.7.8:1080
const MANUAL_PROXIES = (process.env.PROXY_LIST || '')
  .split(',')
  .map(p => p.trim())
  .filter(Boolean);

let currentProxyIndex = 0;

function getNextProxy() {
  if (MANUAL_PROXIES.length === 0) return null;
  const proxy = MANUAL_PROXIES[currentProxyIndex % MANUAL_PROXIES.length];
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
    console.error('Failed to create agent:', err.message);
    return undefined;
  }
}

// ==============================
// Health check (middlewareの前に置く)
// ==============================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    proxyCount: MANUAL_PROXIES.length,
    spoofIp: SPOOF_IP,
    spoofCountry: SPOOF_COUNTRY,
    target: TARGET,
    timestamp: new Date().toISOString()
  });
});

// ==============================
// Main Proxy
// ==============================
const proxyMiddleware = createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  secure: true,
  followRedirects: true,
  ws: true,
  // agent は動的に変えられないので、ここでは設定しない
  // 代わりに router や selfHandleResponse で対応するのが難しいため、
  // シンプルに直接接続 + ヘッダー偽装にフォールバック
  on: {
    proxyReq: (proxyReq, req, res) => {
      // Header Spoofing
      proxyReq.setHeader('Host', 'abema.tv');
      proxyReq.setHeader('X-Forwarded-For', SPOOF_IP);
      proxyReq.setHeader('X-Real-IP', SPOOF_IP);
      proxyReq.setHeader('X-Client-IP', SPOOF_IP);
      proxyReq.setHeader('CF-Connecting-IP', SPOOF_IP);
      proxyReq.setHeader('True-Client-IP', SPOOF_IP);
      proxyReq.setHeader('X-Originating-IP', SPOOF_IP);
      proxyReq.setHeader('X-Forwarded-Proto', 'https');
      proxyReq.setHeader('X-Forwarded-Host', 'abema.tv');
      proxyReq.setHeader('User-Agent', SPOOF_UA);
      proxyReq.setHeader('Accept-Language', 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7');
      proxyReq.setHeader('CF-IPCountry', SPOOF_COUNTRY);
      proxyReq.setHeader('X-Country-Code', SPOOF_COUNTRY);
    },
    error: (err, req, res) => {
      console.error('[Proxy Error]', err.message);
      if (res && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(
          'Proxy Error: ' + err.message + '\n\n' +
          '考えられる原因:\n' +
          '1. 無料プロキシが全滅している\n' +
          '2. ABEMA側が接続を拒否している\n' +
          '3. Railwayからの直接接続が地域制限で弾かれている\n\n' +
          '対策: 有効な日本プロキシを PROXY_LIST に設定してください。'
        );
      }
    }
  }
});

// PROXY_LIST が設定されている場合は agent 付きで動的に処理
app.use('/', (req, res, next) => {
  const proxyUrl = getNextProxy();

  if (proxyUrl) {
    const agent = createAgent(proxyUrl);
    console.log(`[${new Date().toISOString()}] Using proxy: ${proxyUrl.replace(/:\/\/.*@/, '://***@')}`);

    // agent を使う場合は別の middleware を都度作る（簡易実装）
    const dynamicProxy = createProxyMiddleware({
      target: TARGET,
      changeOrigin: true,
      secure: true,
      followRedirects: true,
      agent: agent,
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.setHeader('Host', 'abema.tv');
          proxyReq.setHeader('X-Forwarded-For', SPOOF_IP);
          proxyReq.setHeader('X-Real-IP', SPOOF_IP);
          proxyReq.setHeader('User-Agent', SPOOF_UA);
          proxyReq.setHeader('Accept-Language', 'ja-JP,ja;q=0.9');
          proxyReq.setHeader('CF-IPCountry', SPOOF_COUNTRY);
        },
        error: (err, req, res) => {
          console.error('[Dynamic Proxy Error]', err.message);
          if (res && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Proxy Error (via upstream): ' + err.message);
          }
        }
      }
    });
    return dynamicProxy(req, res, next);
  }

  // プロキシがない場合は直接接続 + ヘッダー偽装
  return proxyMiddleware(req, res, next);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ABEMA reverse proxy running on port ${PORT}`);
  console.log(`Target: ${TARGET}`);
  console.log(`Spoof IP: ${SPOOF_IP} (${SPOOF_COUNTRY})`);
  console.log(`Manual proxies: ${MANUAL_PROXIES.length}`);
});
