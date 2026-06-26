# Ücretsiz Canlıya Alma Kılavuzu

Bu monorepo 3 parça halinde yayınlanır. Hepsi ücretsiz katmanlarda barınabilir.

| Parça | Tür | Nereye | Ücret |
|-------|-----|--------|-------|
| `apps/server` | Fastify Node API | **Render** (free web service) | 0 ₺ (15 dk hareketsizlikte uyur) |
| `apps/showcase` | Vite/React SPA → backend'e `/api/v1/analyze` ile bağlanır | **Vercel** | 0 ₺ |
| `apps/wallet` | Vite/React SPA (statik, backend gerektirmez) | **Vercel / Cloudflare Pages** | 0 ₺ |
| `apps/extension` | Tarayıcı eklentisi | Lokal build → tarayıcıya yükle (yayın değil) | 0 ₺ |

Akış: tarayıcı `showcase` sitesini açar → `/api/v1/analyze` çağrısı **Vercel rewrite** ile Render backend'ine gider (same-origin olduğu için CORS gerekmez) → backend Stellar testnet'i simüle edip sonucu döner.

---

## 1) Backend → Render (önce bunu yap, URL'i lazım olacak)

Repoyu bir GitHub reposuna push'la (Render Git ister).

1. https://render.com → ücretsiz hesap (kredi kartı gerekmez).
2. **New → Blueprint** → bu repoyu seç. Render kökteki `render.yaml`'ı okur ve `baret-api` servisini kurar.
   - Build: `pnpm install && pnpm --filter @stellar-thorn/server build`
   - Start: `node apps/server/dist/index.js`
   - Health check: `/health`
   - Env'ler `render.yaml` içinde hazır (Stellar testnet RPC'leri dahil).
3. Deploy bitince sana bir URL verir: `https://baret-api.onrender.com` (isim farklı olabilir).
4. Test et: `https://<URL>/health` → `{"ok":true}` benzeri dönmeli.

> Blueprint kullanmak istemezsen: **New → Web Service** → repo → Build/Start komutlarını ve env'leri elle gir (bkz. `apps/server/.env.production.example`).

**Free plan notu:** servis 15 dk istek almazsa uyur; sonraki ilk istek ~30 sn sürer. Demo için sorun değil.

---

## 2) Frontend (showcase) → Vercel

1. Kök `vercel.json` içindeki backend URL'ini Render'dan aldığın gerçek URL ile değiştir:
   ```json
   { "source": "/api/:path*", "destination": "https://SENIN-RENDER-URLIN.onrender.com/:path*" }
   ```
   (Bu satır, dev'deki Vite proxy'nin yaptığı `/api` → backend yönlendirmesinin canlı karşılığı. `/api` ön ekini soyar: `/api/v1/analyze` → backend `/v1/analyze`.)
2. https://vercel.com → **Add New → Project** → bu repoyu içe aktar.
3. Vercel kökteki `vercel.json`'ı otomatik kullanır (build + output `apps/showcase/dist` + rewrites). Ekstra ayar gerekmez.
4. Deploy → `https://<proje>.vercel.app` adresinde showcase açılır, `/api/...` çağrıları Render'a proxy'lenir.

> API anahtarı: frontend sabit `dev-key-change-me` gönderiyor (`apps/showcase/src/baret/analyze.ts`). Backend'de `DELTAG_API_KEYS=dev-key-change-me` olduğu için eşleşir. Değiştireceksen ikisini birden değiştir.

---

## 3) Wallet → ayrı bir Vercel projesi (veya Cloudflare Pages)

Wallet statik bir SPA; backend'e ihtiyacı yok (doğrudan Stellar RPC + Freighter/passkey kullanır). Showcase ile **aynı repodan ikinci bir proje** olarak yayınlanır:

Vercel → **Add New → Project** → aynı repo → **Settings** kısmında şunları gir (kök `vercel.json` showcase'e ait olduğu için bunları panelden override et):
- **Root Directory:** `.` (repo kökü)
- **Install Command:** `pnpm install --frozen-lockfile`
- **Build Command:** `pnpm build:wallet`
- **Output Directory:** `apps/wallet/dist`

Alternatif (daha basit): **Cloudflare Pages** → repo → build command `pnpm install && pnpm build:wallet`, output `apps/wallet/dist`.

---

## 4) Extension (opsiyonel — yayın değil, lokal)

```bash
pnpm install
pnpm build:extension
```
Sonra tarayıcıda `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`. (Chrome Web Store'a yüklemek $5 tek seferlik geliştirici ücreti ister — ücretsiz değil.)

---

## Özet komutlar (lokal doğrulama)

```bash
pnpm install
pnpm build:server   # tsc derlemesi geçiyor mu?
pnpm build:showcase
pnpm build:wallet
```

## Sık karşılaşılan sorunlar
- **`/api/v1/analyze` 404 / HTML dönüyor:** `vercel.json`'daki backend URL'i hâlâ placeholder. Render URL'i ile değiştir.
- **Backend açılışta çöküyor:** `STELLAR_HORIZON_URL` / `STELLAR_SOROBAN_RPC_URL` eksik. Zorunlular.
- **İlk istek çok yavaş:** Render free plan soğuk başlangıç. Normal. İstersen [cron-job.org](https://cron-job.org) ile 10 dk'da bir `/health`'i pingleyerek uyutmama (yine ücretsiz).
