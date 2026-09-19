# İstemciler: showcase, bağımsız cüzdan, geliştirici portalı, API doküman sitesi

> Koddan doğrulanmıştır (2026-09-19). Eklenti (asıl cüzdan) ayrıdır: [`docs/extension-architecture.md`](../extension-architecture.md).
> Sunucu: [`server.md`](./server.md). Paketler: [`packages.md`](./packages.md).
>
> **Not:** `/developers` portalı (`apps/showcase/src/pages/developers/`) bu belgenin yazıldığı sırada aktif geliştirme
> altındaydı. Aşağıdaki portal bölümü yapıyı ve sözleşmeleri anlatır; UI ayrıntıları için koda bak.

---

## 1. Showcase (`apps/showcase`)

Vite + React 18 SPA, `react-router-dom`, Tailwind + `@stellar-thorn/ui`. Dev portu **5175**; `/api/*` → `http://localhost:8080` proxy'si
(`vite.config.ts`, `/api` öneki soyulur). Canlıda Vercel `vercel.json` rewrite'ı `/api/:path*` → `https://baret-stellar.onrender.com/:path*`.
Bu yüzden tarayıcıdan bakınca API **aynı origin**'dir (CORS gerekmez).

### 1.1 Rotalar (`src/App.tsx`)

| Rota | Sayfa | Ne |
|---|---|---|
| `/` | `pages/HomePage.tsx` | Landing (hero, 3 sütun, x402 "wedge", SSS…) |
| `/showcase` | `components/Hub.tsx` | 7 demo dApp'in kart ızgarası + yürüyüş |
| `/novaswap` `/pixeldrop` `/orbityield` `/claimhub` `/launchpad` | `sites/*` | Sahte-ama-gerçek ürünler, "Danger Mode" anahtarlı |
| `/scrybe` | `sites/scrybe/Scrybe.tsx` | x402 mutlu yol (gerçek 402 → imza → settle) |
| `/cortex` | `sites/cortex/Cortex.tsx` | x402 saldırı konsolu (drift / asset-swap / blind) |
| `/developers` | `pages/developers/*` | Herkese açık API portalı |
| `/agents` | `pages/AgentsPage.tsx` | `agent-guard` SDK/CLI kontrol sayfası + canlı playground |
| `/install` | `pages/InstallPage.tsx` | Eklenti zip indirme (`/baret-chrome.zip`, `/baret-firefox.zip`) + kurulum adımları |
| `/docs` | `pages/DocsPage.tsx` | `docs/` dosyalarına GitHub linkleri |

Her rota `ErrorBoundary` + `Suspense` (lazy) ile sarılıdır; `RouteMeta` rota başına `<title>`/OG meta'yı yazar.

### 1.2 Cüzdan bağlantısı

`wallet/context.tsx` (`WalletProvider`) + `wallet/standard-bridge.ts`: sayfada `window.baretStellar` (Baret eklentisi) varsa listeler, **Freighter'ı her zaman** listeler
(`@stellar/freighter-api`). Bağlanma **her zaman açık seçimle** olur (otomatik seçim yok). `WalletModal` bilerek **marka-tarafsızdır**: sıralama/öneri yok. Site,
hangi cüzdanın seçildiğini bilmez/umursamaz; korumanın sitede değil cüzdanda olduğu gösterilsin diye.
`showcase` `apps/wallet` popup köprüsünü (`wallet-adapter`) **kullanmaz**.

### 1.3 Demo dApp'ler ve senaryoları

Tüm senaryolar **gerçek, gönderilebilir testnet işlemleridir** (`baret/transactions.ts`, `buildScenario`). Site işlemi kurar, bağlı cüzdanın
`signAndSendTransaction`'ına verir (`baret/useScenarioAction.ts`); **sayfada ön analiz/verdict yoktur**. Analiz cüzdanın popup'ında olur.

| Site | Safe senaryo | Danger/Warn senaryo | Baret'in yakaladığı |
|---|---|---|---|
| NovaSwap | Gerçek testnet DEX order book'unda XLM↔USDC swap | Gerçek USDC SAC üzerinde sınırsız Soroban `approve` (drainer'a) | `SOROBAN_ALLOWANCE_UNLIMITED` |
| PixelDrop | Kendi demo varlığı (PHNTM) mint | Saldırgan issuer'a sınırsız trustline | `UNLIMITED_TRUSTLINE` |
| OrbitYield | XLM'i claimable balance'a kilitler (staking benzeri) | Doğrulanmamış havuz adresine ödeme (warn) | ücret/adres uyarıları |
| ClaimHub | LUMA airdrop (demo issuer) | `AccountMerge` → saldırgan | `ACCOUNT_MERGE_DETECTED` |
| LaunchPad | NOVA satışına katkı | Sınırsız USDC `approve` | `SOROBAN_ALLOWANCE_UNLIMITED` |
| Scrybe | `/demo/scrybe` gerçek x402 ödemesi | - | mandate/tavan mantığı |
| Cortex | Normal | `drift` (12'lik ödeme patlaması), `asset-swap` (native XLM SAC'ta ücret), `blind` (sayfa fiyatı yalan söyler) | tavan aşımı, `allowedAssets`, gerçek auth-entry çözümü |

Notlar:
- 3 klasik-varlık "safe" senaryosu demo issuer'ın da imzasını ister; `DEMO_ISSUER` gömülü, **değersiz testnet** anahtarıdır (bilerek).
- NovaSwap ve LaunchPad "danger" sonrası `simulateDrainerSweep` ile saldırganın `transfer_from` ile bakiyeyi süpürmesi gösterilir.
- Senaryo metinleri `baret/scenarios.ts`'te tek yerde tutulur (site metni ile işlem şekli ayrışmasın).
- Sitelerin görsel kimliği kendindedir (`SiteShell`); Baret markası yoktur. `packages/showcase-ui` yalnızca `DangerModeToggle` sağlar.

### 1.4 Sunucuyla konuşan yerler

| Yer | Çağrı | Kimlik |
|---|---|---|
| `baret/analyze.ts` → `/api/v1/analyze` (yalnız `AgentsPage` playground'u kullanır) | `POST` | Herkese açık demo anahtarı `dev-key-change-me` (kodda gömülü, `render.yaml`'la eşleşir) |
| `Scrybe`, `Cortex` → `/api/demo/scrybe`, `/api/demo/cortex` | `GET` (+`PAYMENT-SIGNATURE`) | Yok |
| `/developers` portalı → `/api/...` | tüm uçlar | Kullanıcının kendi anahtarı (`Authorization: Bearer`) |

### 1.5 Build

`pnpm build:showcase` (`tsc && vite build` → `apps/showcase/dist`). Vercel `buildCommand` sırayla `swig-guard`, `wallet-adapter`, **`extension`** (zip'leri `public/`'e üretmek için), sonra showcase'i derler.
`public/baret-chrome.zip` ve `baret-firefox.zip` git'e girmez (`.gitignore`), her extension build'inde `apps/extension/scripts/pack-downloads.mjs` ile yeniden üretilir.
Görsel varlık kataloğu: [`apps/showcase/ASSET_PROMPTS.md`](../../apps/showcase/ASSET_PROMPTS.md).

---

## 2. Geliştirici portalı (`/developers`)

Dosyalar: `pages/developers/{DevelopersPage,KeyPanel,Playground,Reference,Detectors,AgentPrompt}.tsx`, `endpoints.ts` (elle yazılmış referans kataloğu),
`samples.ts` (Playground için hazır işlemler: normal ödeme + saldırılar; **yalnız analiz edilir, asla imzalanmaz/gönderilmez**),
`snippets.ts` (cURL/JS/Python/Go), `hooks.ts`, `api.ts` (`callApi`, `PUBLIC_API_URL`).
`AgentPrompt.tsx` + `agentPrompt.ts` + `agent-prompt.md`: bir AI ajanına yapıştırılan, ajanın **kendi cüzdanının** imza yoluna Baret'i bağlatan hazır prompt
(`{{API_URL}}`, `{{NETWORK}}`, `{{API_KEY_SECTION}}` yer tutucuları doldurulur). Metin `agent-prompt.md`'dedir; `apps/server/test/api/portal-catalog.test.ts`
prompt'un andığı her endpoint'in var olduğunu ve içine gerçek anahtar gömülmediğini denetler.

Akış: **anahtar al** (`POST /v1/keys`; anahtar tarayıcıda `localStorage`'da tutulur) → **dene** (Playground gerçek `/v1/analyze` çağırır; hazır işlemler için
Friendbot'la fonlanmış geçici testnet hesabının yalnız açık adresi kullanılır) → **kodu kopyala** → **referans** (`/v1/detectors`, `/v1/policy/schema`, `/v1/meta` canlı çekilir).
Portal sunucuyu **mock'lamaz**; ekranda gördüğün geliştiricinin alacağı cevaptır. Sunucu, portalın bilmediği bir anahtarı "çalışmıyor" diye gösterip yenisini önerir
(çünkü Render free'de `keys.json` kaybolabilir, bkz. `LIMITATIONS.md`).

**Senkron kilidi:** `endpoints.ts` ↔ sunucunun OpenAPI'si `apps/server/test/api/portal-catalog.test.ts` ile karşılaştırılır. Sunucuya rota eklerken hem `openapi.ts`'i hem `endpoints.ts`'i güncelle.

Dev'de API adresi `http://localhost:8080`; canlıda `VITE_BARET_API_URL` ya da `https://baret-stellar.onrender.com` (`api.ts`).

---

## 3. Bağımsız cüzdan (`apps/wallet`)

Eklentiyi kuramayanlar/CI/demo için **web tabanlı yedek cüzdan**. Vite + React, port **5180** (`/api` → :8080 proxy), `HashRouter` değil `BrowserRouter`.
Analiz: `swig-guard` `TransactionGuard` (`src/baret/guard.ts`): `VITE_BARET_BASE_URL` (varsayılan `/api`), `VITE_BARET_API_KEY` (**varsayılan yok**; gömülü anahtar bilerek kaldırılmış).

| Parça | Dosya | Not |
|---|---|---|
| Anahtar | `wallet/keypair.ts`, `lib/kdf.ts` | Rastgele `Keypair`; PBKDF2 (eklentiyle **aynı parametreler**) + AES-GCM ile şifrelenip `localStorage`'a (`baret.wallet.v3`) yazılır; parola ≥ 8 karakter |
| Durum | `wallet/state.tsx` | Fazlar: `loading → unprovisioned → locked → identity → ready`; bakiye 8 sn'de yenilenir |
| Ağ | `wallet/connection.ts` | `ACTIVE_NETWORK = "testnet"` **sabit**; Friendbot |
| Gönderim | `wallet/stellar-tx.ts` | XLM payment XDR kur → `guard.evaluate()` → izin varsa imzala → Horizon |
| Smart wallet | `wallet/smart-wallet.ts` | **Yer tutucu**: `smartWalletAddress = authority G… adresi` (TODO: gerçek Soroban entegrasyonu; eklentide gerçek var) |
| dApp bağlantısı | `pages/Connect.tsx`, `pages/Sign.tsx` | `wallet-adapter` protokolü; yalnız `window.opener`'dan gelen mesaj kabul edilir (`lib/verified-message.ts`) |
| Sayfalar | `pages/*` | onboarding, unlock, home, send, receive, history, policies, settings, connect, sign |

Bu uygulama x402 mandate/alt anahtar mantığını **içermez**; o yalnız eklentidedir.

---

## 4. API doküman sitesi (`baret_docs`)

Tailwind Plus "Protocol" şablonundan türeyen **Next.js 16 + MDX** sitesi. **pnpm workspace dışıdır** (kendi `package-lock.json`, `npm`).
Komutlar: `cd baret_docs && npm install && npm run dev` (`:3000`), `npm run lint`, `npm run build` (CI'da ikisi de koşar).

- İçerik: `src/app/**/page.mdx` (Guides + API Reference). Yeni sayfa eklemek için `src/components/Navigation.tsx` içindeki `navigation` dizisine link ekle. `layout.tsx` her sayfanın `export const sections`'ını
  import eder (yoksa `undefined`; mevcut sayfalar bunu kullanır).
- Kaynak-doğruluk: Sayfalar **sunucu davranışını** anlatır. Bir alan/rota/hata kodu değişirse sayfaları da güncelle. Makine kaynağı `GET /openapi.json`, kod haritası `docs/architecture/server.md`.
- `src/components/Libraries.tsx` şablondan kalan, kullanılmayan bir bileşendir (sayfada render edilmez).

---

## 5. Sık sorulanlar

- **Showcase'te neden analiz kutusu yok?** Bilerek kaldırıldı (`ca0f073`): koruma sitede değil cüzdanda görünsün. Sadece `/agents` playground'u ve `/developers` portalı analiz API'sini doğrudan çağırır.
- **`Hub` kaç site içeriyor?** 7 (5 pre-sign + Scrybe + Cortex).
- **Port çakışması?** showcase 5175, wallet 5180, eklenti dev 5181/5182, sunucu 8080 (Docker 18080), baret_docs 3000.
