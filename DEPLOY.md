# Ücretsiz Canlıya Alma Kılavuzu

Bu monorepo 4 parça halinde yayınlanır. Hepsi ücretsiz katmanlarda barınabilir. Mimari için [`ARCHITECTURE.md`](./ARCHITECTURE.md), sunucu ayarları için [`docs/architecture/server.md`](./docs/architecture/server.md) §7.

| Parça | Tür | Nereye | Ücret |
|-------|-----|--------|-------|
| `apps/server` | Fastify Node API | **Render** (free web service) | 0 ₺ (15 dk hareketsizlikte uyur) |
| `apps/showcase` | Vite/React SPA → backend'e `/api/v1/analyze` ile bağlanır | **Vercel** | 0 ₺ |
| `apps/wallet` | Vite/React SPA (statik; analiz için yine API sunucusuna bağlanır, bkz. §3) | **Vercel / Cloudflare Pages** | 0 ₺ |
| `apps/extension` | Tarayıcı eklentisi | Lokal build → tarayıcıya yükle (yayın değil) | 0 ₺ |

Akış: tarayıcı `showcase` sitesini açar → `/api/v1/analyze` çağrısı **Vercel rewrite** ile Render backend'ine gider (same-origin olduğu için CORS gerekmez) → backend Stellar testnet'i simüle edip sonucu döner.

---

## 1) Backend → Render (önce bunu yap, URL'i lazım olacak)

Repoyu bir GitHub reposuna push'la (Render Git ister).

1. https://render.com → ücretsiz hesap (kredi kartı gerekmez).
2. **New → Blueprint** → bu repoyu seç. Render kökteki `render.yaml`'ı okur ve `baret-api` servisini kurar.
   - Build: `corepack enable && corepack prepare pnpm@9.15.0 --activate && pnpm install --frozen-lockfile --prod=false && pnpm --filter @stellar-thorn/server build`
     (`--prod=false` şart: `NODE_ENV=production` iken pnpm devDependencies'i atlar ve `tsc` derlemesi çöker.)
   - Start: `node apps/server/dist/index.js`
   - Health check: `/health`
   - Env'ler `render.yaml` içinde hazır (Stellar testnet RPC'leri, `DELTAG_API_KEYS=dev-key-change-me`, `X402_ENABLED=false`, `DELTAG_TRUST_PROXY=true`).
   - **Elle girmen gereken:** `X402_MERCHANT_SECRET` (`sync:false`). Bunu vermezsen `/demo/scrybe` ve `/demo/cortex` hiç kayıt olmaz ve Scrybe/Cortex sitelerinde her soru "not found" verir. Değeri yerelde `pnpm --filter @stellar-thorn/server x402-setup` üretir (`apps/server/.env` içine yazar); merchant hesabı testnet'te fonlanır ve USDC trustline'ı eklenir. Opsiyonel: `BARET_SIGNING_SECRET` (imzalı karar, bkz. `docs/x402-defense.md` §10).
3. Deploy bitince sana bir URL verir. Bu repo için canlı adres `https://baret-stellar.onrender.com`'dur (`vercel.json` buna işaret eder).
4. Test et: `https://<URL>/health` → `{"status":"ok"}`; `https://<URL>/health/ready` → Soroban RPC hazırsa `{"status":"ready",…}`; `https://<URL>/openapi.json` → canlı API şeması.

> Blueprint kullanmak istemezsen: **New → Web Service** → repo → Build/Start komutlarını ve env'leri elle gir (bkz. `apps/server/.env.production.example`).

**Free plan notu:** servis 15 dk istek almazsa uyur; sonraki ilk istek ~30 sn sürer. Demo için sorun değil.

---

## 2) Frontend (showcase) → Vercel

1. Kök `vercel.json`, `/api/:path*` isteklerini `https://baret-stellar.onrender.com/:path*` adresine yönlendirir. **Kendi Render URL'ini kullanıyorsan** o satırı değiştir:
   ```json
   { "source": "/api/:path*", "destination": "https://SENIN-RENDER-URLIN.onrender.com/:path*" }
   ```
   (Bu satır, dev'deki Vite proxy'nin yaptığı `/api` → backend yönlendirmesinin canlı karşılığı. `/api` ön ekini soyar: `/api/v1/analyze` → backend `/v1/analyze`.)
2. https://vercel.com → **Add New → Project** → bu repoyu içe aktar.
3. Vercel kökteki `vercel.json`'ı otomatik kullanır: build sırası `swig-guard` → `wallet-adapter` → **`extension`** → `showcase` (eklenti build'i `/install` sayfasının zip'lerini `public/`'e üretir), çıktı `apps/showcase/dist`, rewrites (`/api/*` → Render, geri kalan her şey `/index.html`). Ekstra ayar gerekmez.
4. Deploy → `https://<proje>.vercel.app` adresinde showcase açılır, `/api/...` çağrıları Render'a proxy'lenir.

> API anahtarı: showcase (`apps/showcase/src/baret/analyze.ts`) **ve eklenti** (`apps/extension/src/background/messaging/handlers.ts`) sabit `dev-key-change-me` gönderiyor. Backend'de `DELTAG_API_KEYS=dev-key-change-me` olduğu için eşleşir. Değiştireceksen üçünü (Render env, showcase, eklenti) birlikte değiştir.

---

## 3) Wallet → ayrı bir Vercel projesi (veya Cloudflare Pages)

Wallet statik bir SPA'dır ama imza öncesi analiz için API sunucusuna bağlanır (`src/baret/guard.ts`): `VITE_BARET_BASE_URL` (varsayılan `/api`, yani aynı origin'de bir rewrite/proxy gerekir; ayrı bir Vercel projesinde tam Render URL'ini ver) ve `VITE_BARET_API_KEY` (varsayılan yok; sunucu anahtar istiyorsa ver). Showcase ile **aynı repodan ikinci bir proje** olarak yayınlanır:

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
Sonra tarayıcıda `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`. Firefox için `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `apps/extension/dist-firefox/manifest.json` (Firefox ≥ 128; geçici add-on tarayıcı kapanınca kalkar). (Chrome Web Store'a yüklemek $5 tek seferlik geliştirici ücreti ister — ücretsiz değil.)
Paketli eklenti analiz için `https://baret-stellar.onrender.com` adresini kullanır; kendi sunucunu kullanacaksan `apps/extension/src/background/baret/analyze-client.ts` içindeki `DEFAULT_BASE_URL`'i değiştirip yeniden build etmelisin.

---

## 5) Herkese açık geliştirici API'si (anahtarlar)

Sunucu artık dışarıdan geliştiricilere açılabilir: `https://<SUNUCU>/openapi.json` (spec) ve showcase'teki
`/developers` sayfası (anahtar al, dene, kodu kopyala). Herkes `POST /v1/keys` ile ücretsiz anahtar üretir.

| Env | Ne yapar |
|---|---|
| `BARET_KEY_ISSUANCE` | `open` (varsayılan) / `closed`. Saf x402 modunda varsayılan `closed`. |
| `BARET_KEY_RATE_LIMIT_PER_MIN` | Üretilen anahtar başına dakikalık limit (60) |
| `BARET_KEY_ISSUE_PER_IP_PER_HOUR` | Aynı IP'den saatte kaç anahtar (5) |
| `BARET_DATA_DIR` | Anahtarların (yalnız SHA-256 özeti) yazıldığı klasör |
| `BARET_CORS_ORIGINS` | `*` ya da izinli origin listesi |

> **Önemli — anahtarlar kalıcı olmayabilir.** Render **free** planında disk geçicidir: servis uyuyup yeniden
> başladığında ya da yeniden deploy edildiğinde `keys.json` silinir ve verilen tüm anahtarlar geçersiz olur.
> Kalıcı disk (Render ücretli plan) ya da Docker'da volume (`docker-compose.yml` zaten `/data` bağlar)
> kullan. Portal, sunucunun tanımadığı anahtarı "çalışmıyor" diye gösterir ve yenisini üretmeyi önerir.

Demo için showcase'in kullandığı paylaşımlı `dev-key-change-me` anahtarı (`DELTAG_API_KEYS`) çalışmaya devam eder;
gerçek kullanıma açarken onu değiştir (frontend'deki `DEMO_API_KEY` ile birlikte).

Portal, API adresini `apps/showcase/src/pages/developers/api.ts` içindeki `PUBLIC_API_URL`'den gösterir
(varsayılan `https://baret-stellar.onrender.com`, `vercel.json` rewrite'ıyla aynı). Farklıysa
`VITE_BARET_API_URL` ver.

---

## 6) Docker (opsiyonel, yalnızca API)

```bash
pnpm docker:up     # docker compose up --build -d  → http://localhost:18080 (iç 8080)
pnpm docker:logs
pnpm docker:down
```

`docker-compose.yml` API'yi `18080`'e açar, `DELTAG_API_KEYS` (varsayılan `docker-demo-key`), Stellar testnet RPC'leri ve `/data` volume'unu (anahtar deposu) tanımlar; `Dockerfile` `apps/server/Dockerfile`'dır.
> **Doğrulanmadı:** Bu doküman güncellenirken Docker build'i çalıştırılmadı. `Dockerfile` yalnızca `apps/server/package.json`'ı kopyalayıp `pnpm install --frozen-lockfile` çalıştırdığı için,
> workspace lockfile'ı ile uyuşmama riski var; sorun çıkarsa build bağlamında tüm workspace `package.json`'larını kopyala. (Önceki hali `@deltag/server` filtresini kullandığı için hiçbir projeyle eşleşmiyordu; düzeltilmiş görünüyor.)
> Docker'da `X402_MERCHANT_SECRET` compose'da tanımlı değildir; demo satıcıları için ekle.

---

## 5) Herkese açık geliştirici API'si (anahtarlar)

Sunucu artık dışarıdan geliştiricilere açılabilir: `https://<SUNUCU>/openapi.json` (spec) ve showcase'teki
`/developers` sayfası (anahtar al, dene, kodu kopyala). Herkes `POST /v1/keys` ile ücretsiz anahtar üretir.

| Env | Ne yapar |
|---|---|
| `BARET_KEY_ISSUANCE` | `open` (varsayılan) / `closed`. Saf x402 modunda varsayılan `closed`. |
| `BARET_KEY_RATE_LIMIT_PER_MIN` | Üretilen anahtar başına dakikalık limit (60) |
| `BARET_KEY_ISSUE_PER_IP_PER_HOUR` | Aynı IP'den saatte kaç anahtar (5) |
| `BARET_DATA_DIR` | Anahtarların (yalnız SHA-256 özeti) yazıldığı klasör |
| `BARET_CORS_ORIGINS` | `*` ya da izinli origin listesi |

> **Önemli — üretilen anahtarlar kalıcı olmayabilir.** Render **free** planında disk geçicidir: servis uyuyup
> yeniden başladığında ya da yeniden deploy edildiğinde `keys.json` silinir ve verilen tüm anahtarlar geçersiz olur.
> Kalıcı disk (Render ücretli plan) ya da Docker'da volume (`docker-compose.yml` zaten `/data` bağlar) kullan.
> Geçici çözüm: kalıcı olması gereken anahtarları Render panelinde `DELTAG_API_KEYS` env'ine virgülle ekle
> (`dev-key-change-me,baret_…`); env'den okunan anahtarlar restart'tan etkilenmez ama anahtar başına limit/kullanım
> sayacı yoktur. Portal, sunucunun tanımadığı anahtarı "çalışmıyor" diye gösterir ve yenisini üretmeyi önerir.

Demo için showcase'in kullandığı paylaşımlı `dev-key-change-me` anahtarı (`DELTAG_API_KEYS`) çalışmaya devam eder;
gerçek kullanıma açarken onu değiştir (frontend'deki `DEMO_API_KEY`, eklenti ve `render.yaml` ile birlikte).

Portal, API adresini `apps/showcase/src/pages/developers/api.ts` içindeki `PUBLIC_API_URL`'den gösterir
(varsayılan `https://baret-stellar.onrender.com`, `vercel.json` rewrite'ıyla aynı). Farklıysa
`VITE_BARET_API_URL` ver.

---

## Özet komutlar (lokal doğrulama)

```bash
pnpm install
pnpm build:server   # tsc derlemesi geçiyor mu?
pnpm build:showcase
pnpm build:wallet
pnpm docs:check     # doküman tutarlılığı (bozuk link, var olmayan yol, belgelenmemiş env/paket)
(cd baret_docs && npm ci && npm run lint && npm run build)   # API doküman sitesi (CI'da da koşar)
```

## Sık karşılaşılan sorunlar
- **`/api/v1/analyze` 404 / HTML dönüyor:** `vercel.json`'daki `/api` rewrite'ı çalışan bir backend'e işaret etmiyor. Kendi Render URL'inle değiştir.
- **Scrybe/Cortex'te her soru "not found":** Render'da `X402_MERCHANT_SECRET` yok (rotalar hiç kayıt olmadı). §1'e bak.
- **Verilen API anahtarları bir süre sonra "geçersiz":** Render free diskinde `keys.json` silindi; kalıcı disk kullan (§5).
- **Eklentide "Could not reach Baret":** Sunucu uyuyor olabilir (ilk istek ~30 sn; eklenti 25 sn bekler, tekrar dene) ya da `DEFAULT_BASE_URL` yanlış.
- **Backend açılışta çöküyor:** `STELLAR_HORIZON_URL` / `STELLAR_SOROBAN_RPC_URL` eksik. Zorunlular.
- **İlk istek çok yavaş:** Render free plan soğuk başlangıç. Normal. İstersen [cron-job.org](https://cron-job.org) ile 10 dk'da bir `/health`'i pingleyerek uyutmama (yine ücretsiz).
