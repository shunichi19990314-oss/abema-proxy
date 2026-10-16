# ABEMA Reverse Proxy

ABEMA (https://abema.tv) をリバースプロキシ経由でアクセスするための簡易サーバーです。  
Railway + 日本プロキシ、または日本VPSの両方に対応しています。

> **注意**  
> ABEMAの利用規約に違反する可能性があります。自己責任でご利用ください。  
> 動画再生やログインが完全に動く保証はありません（DRM・高度な検知があるため）。

---

## 方法1: Railway + 日本プロキシ（推奨構成の一つ）

Railway自体に日本リージョンがないため、**日本のプロキシを経由**させて地域制限を回避します。

### 必要なもの
- Railwayアカウント
- 日本のHTTP/SOCKS5プロキシ（住宅IP推奨）

### デプロイ手順

1. このリポジトリをRailwayに接続してDeploy
2. Variables に以下を追加:

```env
UPSTREAM_PROXY=http://ユーザー名:パスワード@プロキシホスト:ポート
# または
UPSTREAM_PROXY=socks5://ユーザー名:パスワード@プロキシホスト:ポート
```

3. 再デプロイ
4. Settings → Networking でドメインを発行

### 日本プロキシの例
- 住宅IP: IPIPGO, Bright Data, IPRoyal, Smartproxy など
- 安価なデータセンターIPでも一時的に動く場合あり（検知されやすい）

---

## 方法2: 日本VPSに直接デプロイ（最も安定）

東京リージョンのあるVPSにそのまま置く方法です。プロキシ不要でシンプルかつ安定します。

### おすすめVPS
- Vultr (Tokyo)
- Linode / Akamai (Tokyo)
- Sakura VPS
- ConoHa VPS
- Oracle Cloud (Tokyo) ※無料枠あり

### デプロイ手順（Ubuntu例）

```bash
# 1. Node.js インストール
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. リポジトリをクローン
git clone https://github.com/shunichi19990314-oss/abema-proxy.git
cd abema-proxy

# 3. 依存関係インストール
npm install

# 4. 起動確認
npm start
```

### 本番運用（systemd）

`/etc/systemd/system/abema-proxy.service` を作成:

```ini
[Unit]
Description=ABEMA Reverse Proxy
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/abema-proxy
ExecStart=/usr/bin/node index.js
Restart=always
Environment=PORT=3000
# 必要なら
# Environment=UPSTREAM_PROXY=...

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now abema-proxy
sudo systemctl status abema-proxy
```

### リバースプロキシ（Nginx）を前段に置く場合

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 環境変数一覧

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `PORT` | リッスンポート | `3000` |
| `TARGET` | プロキシ先 | `https://abema.tv` |
| `UPSTREAM_PROXY` | 日本プロキシURL（http/socks5） | なし |

---

## ヘルスチェック

`/health` にアクセスすると動作状況が返ります。

```json
{
  "status": "ok",
  "upstreamProxy": true,
  "target": "https://abema.tv",
  "timestamp": "..."
}
```

---

## トラブルシューティング

- まだ地域制限が出る → 日本プロキシのIPが検知されている可能性。住宅IPに切り替えるか、別のプロキシを試す
- 動画が再生できない → ABEMAのDRMや追加の検知が原因の可能性が高い
- WebSocketエラー → プロキシがWebSocketをサポートしているか確認

---

## License

MIT
