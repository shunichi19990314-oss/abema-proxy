# ABEMA Reverse Proxy

ABEMA用のリバースプロキシです。無料公開プロキシの自動取得と、ヘッダー偽装機能を備えています。

> **重要**  
> ヘッダー偽装だけではABEMAの地域制限はほぼ突破できません。  
> ABEMAは実際の接続元IPを見ているためです。効果は限定的です。

---

## 機能

- 無料日本プロキシの自動取得・ローテーション
- ヘッダー偽装（X-Forwarded-For / X-Real-IP など）
- User-Agent / Accept-Language の日本語化
- `/health` `/proxies` で状態確認

---

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `PORT` | ポート | `3000` |
| `TARGET` | プロキシ先 | `https://abema.tv` |
| `PROXY_LIST` | 手動プロキシ（カンマ区切り） | なし |
| `SPOOF_IP` | 偽装するIP | `126.0.0.1` |
| `SPOOF_COUNTRY` | 偽装する国コード | `JP` |
| `SPOOF_UA` | User-Agent | Chrome (Windows) |

### ヘッダー偽装の例

```env
SPOOF_IP=126.36.123.45
SPOOF_COUNTRY=JP
```

---

## 注意

ヘッダーをいくら書き換えても、ABEMA側から見える「本当の接続元IP」は変わりません。  
地域制限を解除したい場合は、日本のIPを持つプロキシやVPSを使う必要があります。

---

## License

MIT
