# Baret: Sistem Mimarisi

> **Bu dosya haritadır.** Projenin ne olduğunu, hangi parçanın ne yaptığını, parçaların neden birbirine bağlı
> olduğunu ve verinin nereden nereye aktığını anlatır. Ayrıntı isteyen her konu için bir derin dalış dokümanına
> link verir (bkz. [`docs/README.md`](./docs/README.md)).
>
> **Doğruluk kuralı:** Tek otorite koddur. Bu dosya 2026-09-19'da kaynak koda karşı doğrulandı. Bir uyuşmazlık
> görürsen koda güven, dokümanı düzelt. Dokümanları güncel tutma protokolü [`AGENTS.md`](./AGENTS.md) ve
> [`docs/README.md`](./docs/README.md) içinde.

---

## İçindekiler

1. [Baret nedir](#1-baret-nedir)
2. [Monorepo haritası](#2-monorepo-haritası)
3. [Büyük resim](#3-büyük-resim)
4. [Ana akışlar](#4-ana-akışlar)
5. [Güven sınırları](#5-güven-sınırları)
6. [Durum haritası (veri nerede duruyor)](#6-durum-haritası)
7. [Portlar, ortamlar, deploy](#7-portlar-ortamlar-deploy)
8. [Neden böyle bağlı (tasarım kararları)](#8-neden-böyle-bağlı)
9. [İsimlendirme mirası](#9-i̇simlendirme-mirası)
10. [Derin dalış dokümanları](#10-derin-dalış-dokümanları)

---

## 1. Baret nedir

Baret, **Stellar için işlem güvenlik duvarıdır**. Bir kullanıcı ya da agent bir işlemi imzalamadan önce Baret
işlemi okur, simüle eder, risk dedektörlerinden geçirir ve kullanıcının kurallarına göre bir karar verir:
**Safe / Caution / Blocked**. Ek olarak, AI agent'ların yaptığı **x402** mikro ödemelerine (HTTP 402) harcama
tavanı koyar. Bu tavan hem cüzdanda hem zincir üzerinde (Soroban kontratı) uygulanır.

Aynı motor dört yüzeyde sunulur:

| Yüzey | Kim kullanır | Nerede |
|---|---|---|
| **Tarayıcı cüzdanı** (Chrome/Firefox MV3) | İnsan kullanıcı | `apps/extension` |
| **HTTP analiz API'si** (`/v1/analyze`, anahtarlı) | Cüzdanlar, dApp'ler, geliştiriciler | `apps/server` |
| **Agent SDK + CLI** (`baret`) | Otonom agent / bot cüzdanları | `packages/agent-guard` |
| **MCP araçları** (`/mcp/*`) | LLM agent'lar | `apps/server` |

Bunları kanıtlayan bir **showcase** sitesi (`apps/showcase`, gerçek testnet işlemleriyle) ve zincir üzerindeki
harcama politikası **MerchantSpendPolicy** (`contracts/`) da ürünün parçasıdır.

**Durum:** Hackathon aşaması, **Stellar testnet**. Eklenti mağazada değil (unpacked/geçici add-on). Bilinen
sınırlar: [`LIMITATIONS.md`](./LIMITATIONS.md). Spec ile gerçek arasındaki fark:
[`docs/implementation-status.md`](./docs/implementation-status.md).

---

## 2. Monorepo haritası

pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`). Paket adları `@stellar-thorn/*`. Not:
`contracts/` (Rust) ve `baret_docs/` (Next.js, kendi `package-lock.json`'ı var) workspace **dışındadır**.

| Dizin | Paket adı | Rol | Dev portu |
|---|---|---|---|
| `apps/server` | `@stellar-thorn/server` | Fastify analiz + x402 + geliştirici API'si | 8080 |
| `apps/extension` | `@stellar-thorn/extension` | Chrome/Firefox MV3 cüzdan (asıl ürün yüzeyi) | 5181 (+HMR 5182) |
| `apps/showcase` | `@stellar-thorn/showcase` | Landing, 7 demo dApp, `/developers` portalı, `/agents`, `/install` | 5175 |
| `apps/wallet` | `@stellar-thorn/wallet` | Bağımsız web cüzdanı (demo/fallback) | 5180 |
| `packages/swig-guard` | `@stellar-thorn/swig-guard` | Guard SDK: policy şablonları + `/v1/analyze` istemcisi (SDK'sız) | - |
| `packages/agent-guard` | `@stellar-thorn/agent-guard` | `AgentWallet` + `baret` CLI + attestation doğrulama | - |
| `packages/baret-adapter` | `@stellar-thorn/wallet-adapter` | dApp ↔ bağımsız cüzdan `postMessage` popup köprüsü | - |
| `packages/ext-protocol` | `@stellar-thorn/ext-protocol` | Eklenti yüzeyleri arası mesaj/tip sözleşmesi | - |
| `packages/ui` | `@stellar-thorn/ui` | Tasarım sistemi (token'lar, primitives, shadcn katmanı) | - |
| `packages/showcase-ui` | `@stellar-thorn/showcase-ui` | Demo sitelerin ortak parçası (şimdilik `DangerModeToggle`) | - |
| `contracts/contracts/merchant-spend-policy` | (Rust crate) | **Güncel** zincir üstü harcama politikası | - |
| `contracts/contracts/payment-guard` | (Rust crate) | **Eski** custodial vault denemesi (ürün dışı) | - |
| `baret_docs` | `tailwind-plus-protocol` | Herkese açık API dokümantasyon sitesi (Next.js + MDX) | 3000 |
| `docs/` | - | Tasarım/spec dokümanları (bkz. `docs/README.md`) | - |
| `assets/` | - | Kaynak görseller (kodda referans yok; sunulan varlıklar `apps/showcase/public/`'te) | - |
| `scripts/` | - | Repo araçları (`check-docs.mjs`: doküman tutarlılık denetimi; `check-secrets.mjs`: sır taraması) | - |

Paket bağımlılık grafiği ve "neden ayrı paket" gerekçesi: [`docs/architecture/packages.md`](./docs/architecture/packages.md).

---

## 3. Büyük resim

```
                         ┌────────────────────────────────────────────────┐
                         │  apps/server  (Fastify, tek süreç)             │
                         │  /v1/analyze · /batch · /stream · /decode      │
                         │  /v1/replay · /v1/audit/* · /mcp/*             │
                         │  /v1/keys · /v1/meta · /openapi.json           │
                         │  /demo/scrybe · /demo/cortex (x402 satıcı)     │
                         └──▲─────────▲───────────▲───────────▲───────────┘
                            │         │           │           │  Horizon + Soroban RPC
   ┌────────────────────────┴─┐  ┌────┴─────┐ ┌───┴──────┐ ┌──┴───────────┐   ▲
   │ apps/extension           │  │ apps/    │ │ packages/│ │ 3. taraf     │   │
   │ (MV3 background worker)  │  │ showcase │ │ agent-   │ │ geliştirici  │   │
   │ analyze-client ──────────┼──┘ (proxy   │ │ guard    │ │ (curl/SDK)   │   │
   └──────▲───────────────────┘   /api →    │ │ + baret  │ └──────────────┘   │
          │ port: bx-wallet-standard        │ │ CLI      │                    │
   ┌──────┴──────────┐                      │ └──────────┘                    │
   │ content script  │  (izole dünya)       └─────────┬───────────────────────┘
   └──────▲──────────┘                                │ window.baretStellar
          │ window.postMessage                        ▼
   ┌──────┴──────────────────────────────────────────────┐
   │ inpage (sayfanın MAIN dünyası)                      │◄── dApp / showcase sitesi
   │  window.baretStellar  +  fetch() 402 interceptor    │
   └──────────────────────────────────────────────────────┘

   Extension background ──► Horizon / Soroban RPC (bakiye, gönderim, smart wallet deploy/signer işlemleri)
                       ──► Stellar testnet: smart wallet (passkey-kit) + MerchantSpendPolicy
   x402: cüzdan yalnızca PAYMENT-SIGNATURE üretir; facilitator'ı (/verify, /settle) SATICI SUNUCU çağırır
```

Üç ana fikir:

1. **İmzadan önce oku.** Sunucu işlemi çözer, Horizon'dan hesap durumunu çeker, Soroban preflight çalıştırır,
   dedektörleri koşturur ve kullanıcının `policy` nesnesine göre `safe: true/false` döner.
2. **Karar cüzdanda verilir.** Sunucu bir girdidir, güven sınırı değildir. Eklenti, sunucuya ulaşamazsa bile
   "korumasız imza" uyarısıyla çalışır; x402 harcama tavanlarını sunucudan bağımsız, kendi IndexedDB'sinde
   uygular.
3. **Tavan zincirde de uygulanır.** Her onaylı merchant için cüzdanın smart wallet kontratına, yalnızca o
   merchant'a ve tavana bağlı bir alt anahtar (sub-key) eklenir. Sızan alt anahtar yalnızca o merchant'ın
   tavanını boşaltabilir (alt anahtar kurulumu best-effort'tur, bkz. §4.3). Ayrıntı: [`docs/x402-defense.md`](./docs/x402-defense.md) §11 ve
   [`contracts/README.md`](./contracts/README.md).

---

## 4. Ana akışlar

### 4.1 Sunucuda işlem analizi (`POST /v1/analyze`)

Gövde: `{ network, transactionXdr, policy?, userWallet?, integratorRequestId?, paymentRequirements? }`.

```
İSTEK
  │
  ▼ onRequest hook'ları (app.ts, sırayla)
[1] CORS (ilk; preflight'ı burada cevaplar, 401/429'lara da header ekler)
[2] IP başına rate limit (@fastify/rate-limit; /health muaf)
[3] Auth (api/auth.ts): /v1/* ve /mcp/* varsayılan KAPALI, PUBLIC_ROUTES muaf.
    Bearer/X-API-Key → statik anahtar (DELTAG_API_KEYS) ya da üretilmiş anahtar (baret_…, anahtar başı dk. limiti)
    x402 modunda POST /v1/analyze için anahtarsız geçiş → ödeme katmanı (preHandler) 402 döner
  │
  ▼ routes/analyze.ts → application/analyze-transaction.ts
[4]  Zod gövde doğrulama; network ≠ sunucu ağı ise 400 WRONG_NETWORK
[5]  decodeStellarTransactionXdr → fee-bump ise iç işlem açılır
[6]  collectTxAccounts → G… hesaplar, C… kontratlar, varlıklar; pickAccountsForSimulation → MAX_SIMULATION_OPERATIONS'a kırp
[7]  StellarSimulator.simulate → Horizon pre-state (paralel) + Soroban preflight
     (preflight öncesi auth girdileri SİLİNİR: imzasız address-credential auth "recording" modunda çalışsın)
[8]  extractEstimatedChanges → native/asset/trustline/allowance delta'ları
[9]  parseSorobanAuthTree (cpiTrace) + decodeTransactionOperations (insan okur özet)
[10] runRiskDetection → 8 dedektör (account, simulation, programs, cpi, reputation, compute, deltas, x402)
[11] evaluatePolicy → policy bayrakları bulguları bloklamaya çevirir; ek bulgular (kayıp %, min bakiye)
[12] generateSuggestions
[13] (opsiyonel) signVerdict → Ed25519 attestation (BARET_SIGNING_SECRET varsa)
[14] AuditStore.record (bellek, 10.000 kayıt)
  │
  ▼
[15] analyzeResponseSchema (Zod) ile cevap doğrulanır; x402 açıksa BU NOKTADAN SONRA ödeme settle edilir
YANIT { safe, reasons, estimatedChanges, riskFindings, simulationWarnings, annotation, suggestions, meta, attestation? }
```

Önemli davranışlar:
- **Policy varsayılanı `{}`'dir.** Boş policy yalnızca başarısız Soroban simülasyonunu ve eksik veriyi
  (`LOW_CONFIDENCE_INCOMPLETE_DATA`, `allowWarnings` true değilse) bloklar. Bir bulgunun bloklaması için ilgili
  `policy` bayrağı açık olmalıdır, aksi halde bulgu yalnızca bilgilendiricidir.
- **Fail-closed alanlar:** `maxLossPercent`/`minPostUsdcBalance` set edilip `userWallet` yoksa ya da veri
  hesaplanamıyorsa sonuç bloklanır.
- Üretilmiş (`baret_…`) anahtarların dakikalık limiti batch/stream'de HTTP isteği başına değil **işlem başına**
  tüketilir (25'lik batch = 25 hak). Statik `DELTAG_API_KEYS` anahtarları yalnızca IP limitine tabidir.

Tam ayrıntı (dedektör kodları, policy motoru, auth, anahtarlar, x402, MCP, audit, attestation, config):
[`docs/architecture/server.md`](./docs/architecture/server.md).

### 4.2 Cüzdanda imza akışı (eklenti)

```
dApp ──window.baretStellar.signTransaction(xdr)──► inpage/wallet-standard.ts
  └─ window.postMessage {__bx_ws}──► content/index.ts (izole dünya)
       └─ origin'i GERÇEK window.location.origin ile ezer (attachTrustedOrigin)
       └─ port "bx-wallet-standard" ──► background/messaging/router.ts ──► wallet-standard/handlers.ts
            ws.signTransaction → queueAndWait("transaction") → sign.start (state: signing)
            → popup-window.ts küçük bir popup penceresi açar
                 popup/SignRequest.tsx
                   tx.peekRequest ──► kuyruğun başı
                   tx.analyzeRequest ──► background/baret/analyze-client.ts ──► POST /v1/analyze
                       (policy = kayıtlı GuardPolicy, yoksa BALANCED_POLICY; userWallet = authority G…)
                   ─► verdict: allow / advisory / block  (sunucuya ulaşılamazsa "offline" advisory: Retry + imza için basılı tutma)
                 kullanıcı Sign / Decline  (Blocked ise 1.5 sn basılı tutma ile override)
                 tx.sign ──► performSign: aktif hesabın anahtarıyla imza (+ signAndSend ise Horizon'a gönder)
       ◄── imzalı XDR ── dApp
```

- Bağlanma (`ws.connect`): kilitliyse popup açıp kilit açılmasını bekler; site izni (`site_permissions`,
  hesap+origin bazlı, `trusted|denied`, `remembered`) yoksa popup'ta `ConnectApproval` gösterir.
- Mesaj imzası, auth entry imzası (`ws.signAuthEntry`) ve x402 ödeme imzası aynı kuyruktan geçer
  (`SignKind`: `message | transaction | transactionAndSend | authEntry | x402Payment | connect`).
- Anahtar yalnızca service worker belleğinde durur; boşta `idleTimeoutMs` (varsayılan 15 dk) sonra kilitlenir.

Yüzeyler arası mesaj sözleşmesi, IndexedDB şeması, kripto: [`docs/extension-architecture.md`](./docs/extension-architecture.md).

### 4.3 x402 harcama akışı (agent ödemeleri)

Cüzdan x402 ödemelerini iki girişten yakalar. İkisi de **aynı mandate kuralına** uyar:

```
Giriş A: fetch interceptor                        Giriş B: dApp doğrudan signAuthEntry çağırır
 (inpage/x402-interceptor.ts)                      (ör. showcase Scrybe: @x402/stellar istemcisi)
 402 + PaymentRequirements görür                   ws.signAuthEntry → tryAutoApproveX402AuthEntry
 → "x402.review" → x402Review()                    (entry'yi ayrıştırır: SAC transfer(from,to,amount))
        └───────────────┬─────────────────────────────────┘
                        ▼
   1. Doğrula: scheme=exact, network eşleşmesi, asset/payTo C…/G…, maxTimeoutSeconds ≤ 600, sponsorBy var
   2. Policy listeleri: allowedAssets / blockedMerchantOrigins / allowedMerchantOrigins / allowedFacilitators
   3. Allowance satırı (hesap::origin::asset): yoksa "pending" olarak yaratılır (oto-onay YOK)
   4. Otomatik imza YALNIZ canlı mandate varsa (status=active ve süresi dolmamış) VE x402AutoApprove !== false
      aksi halde popup: mandate şartları (tavanlar, süre) gösterilir, kullanıcı elle onaylar
   5. Tavanlar: global maxX402PerTx + satır başı capPerTx/capPerHour/capPerDay (tryReserveSpend: atomik, kayan pencere)
   6. Ödeme: smart wallet (C…) AKTÖR; auth-entry imzası passkey-kit ile (Ed25519 alt anahtar veya admin authority)
   7. PAYMENT-SIGNATURE başlığı (v2 PaymentPayload, base64) → istek yeniden gönderilir
```

Elle onay, mandate'i canlı yapar (`promoteAllowance`) ve zincir üstü alt anahtarı kurar (ilk onayda, süresi dolan mandate'in
yenilenmesinde ve önceki kurulum başarısız olduysa; `refreshSubKeyAfterApproval`): `MerchantSpendPolicy` cüzdana `Policy` signer olarak eklenir (ilk seferde),
`set_allowance(wallet, merchant=payTo, signer=altAnahtar, tavanlar, mandate)` çağrılır, sonra alt anahtar
`SignerLimits{token: [Policy(MerchantSpendPolicy)]}` ile `Ed25519` signer olarak eklenir. Sonraki otomatik
ödemeler bu alt anahtarla imzalanır ve cüzdanın `__check_auth`'u politikayı çağırır. Bu adım **best-effort**'tır:
başarısız olursa mandate yine geçerlidir ama ödemeler admin anahtarıyla imzalanır (zincir tavanı devreye girmez).

Elle iptal (`ledger.revoke`) zincirde `remove_signer` yollar. `ledger.pause` yalnızca yerel durumdur.

Protokol ayrıntıları, saldırı matrisi, hangi savunmanın gerçekte var olduğu:
[`docs/x402-defense.md`](./docs/x402-defense.md).

### 4.4 x402 satıcı tarafı (sunucu)

İki ayrı şey vardır, karıştırma:

| | `POST /v1/analyze` paywall'ı | `/demo/scrybe` ve `/demo/cortex` |
|---|---|---|
| Amaç | Analiz API'sini ödemeli sunmak | Showcase'in gerçek x402 satıcısı |
| Açan ayar | `X402_ENABLED=true` + `X402_PAY_TO` | `X402_MERCHANT_SECRET` (yoksa rota hiç kayıt olmaz) |
| Kütüphane | `@x402/core` + `@x402/stellar` (`x402HTTPResourceServer`) | Elle yazılmış `FacilitatorClient` (`x402/facilitator-client.ts`) |
| Auth | `DELTAG_AUTH_MODE` (`api_key`/`x402`/`both`) | Yok (`/demo/*` `/v1` altında değil) |

Her ikisi de facilitator'ın `/verify` ve `/settle` uçlarını kullanır; settlement gerçek bir testnet işlemidir.

### 4.5 Agent akışı

`AgentWallet.guardedSubmit(xdr)`: `TransactionGuard.evaluate` → `/v1/analyze` → policy izin verirse yerel
`Keypair` ile imzala → Horizon'a gönder. Sunucu erişilemezse **imzalamaz** (fail-closed, `allowOffline`
bilinçli istisna). `pinnedServerPublicKey` verilirse cevaptaki Ed25519 attestation doğrulanır; yanlış/eksikse
`AttestationError`. CLI aynı şeyi `baret analyze|sign|submit` ile yapar (çıkış kodları: 0 izin, 1 blok, 2 hata).

### 4.6 Geliştirici API'si (3. taraf)

`POST /v1/keys` ile ücretsiz anahtar (yalnızca SHA-256 özeti `BARET_DATA_DIR/keys.json`'da) → `Authorization:
Bearer baret_…` → `/v1/analyze` vb. Keşif uçları (`/v1/meta`, `/v1/detectors`, `/v1/policy/schema`,
`/openapi.json`) anahtarsızdır. Şema kaynağı: `apps/server/src/api/openapi.ts` (elle yazılmış, testle rota
listesine kilitli). İnsan okur doküman: [`baret_docs`](./baret_docs) ve showcase'teki `/developers` portalı.

---

## 5. Güven sınırları

| Sınır | Ne korunuyor | Nasıl |
|---|---|---|
| Sayfa JS'i → content script | Origin sahteciliği | Content script, payload'daki `origin`'i izole dünyanın gerçek `window.location.origin`'iyle ezer |
| Content/popup → background | Sadece bu eklentinin bağlamları | `runtime.onConnect` port adı + `port.sender.id === runtime.id` |
| Anahtar malzemesi | Root seed | Web Crypto PBKDF2-SHA256 **600.000** iterasyon + AES-GCM; şifresi çözülmüş seed yalnızca SW belleğinde; kilitlenince sıfırlanır; parola denemeleri kademeli geri çekilmeli |
| Analiz sunucusu | Doğruluk | **Güven sınırı değil.** İsteğe bağlı Ed25519 attestation var; doğrulayan yalnızca `agent-guard` (eklenti/showcase doğrulamıyor) |
| Popup penceresi (bağımsız cüzdan) | Sahte connect/sign talebi | `apps/wallet` yalnızca `window.opener`'dan gelen mesajı kabul eder (`isFromTrustedOpener`) |
| Zincir | Harcama tavanı | `MerchantSpendPolicy.policy__`: deny-by-default, tek `transfer` bağlamı, alt anahtar bağlama, per-tx + kayan 24 s tavan, mandate süresi |

Tehdit modeli ayrıntısı ve neyin **uygulanmadığı**: [`docs/implementation-status.md`](./docs/implementation-status.md).

---

## 6. Durum haritası

Her parçanın veriyi nerede tuttuğu (kayıp/sıfırlanma davranışıyla):

| Yer | Anahtar / depo | İçerik | Ömür |
|---|---|---|---|
| Eklenti IndexedDB `baret` (v4) | `keystore` | Şifreli root seed + hesap listesi | Kalıcı (+ `storage.local` aynası) |
| | `allowances` | Merchant başı mandate/tavan/harcama günlüğü (`spendLog`) | Kalıcı, hesap kapsamlı |
| | `sub_keys` | Şifreli alt anahtar sırları | Kalıcı, hesap kapsamlı |
| | `history` (≤500), `alerts`, `site_permissions` | Geçmiş, alarmlar, connect izinleri | Kalıcı, hesap kapsamlı |
| | `monitor`, `prefs` | Şemada var, **kodda kullanılmıyor** | - |
| Eklenti `storage.local` | `baret.policy.v1` | Kayıtlı `GuardPolicy` | Kalıcı |
| | `baret.keystore.backup.v1`, `baret.backupAck.v1`, `baret.monitor.lastSeen.v1`, `baret.overlayHidden.v1` | Keystore aynası, yedek onayı, monitör imleci, sayfa rozeti gizleme | Kalıcı |
| Eklenti SW belleği | oturum | Çözülmüş root seed, alt anahtar önbelleği, parola (5 dk TTL), onay kuyruğu | Kilitle/SW ölünce gider |
| Bağımsız cüzdan `localStorage` | `baret.wallet.v3`, `baret.policy.v1`, `baret.history.v1` | Şifreli anahtar, policy, geçmiş | Kalıcı (tarayıcı verisi) |
| Sunucu belleği | `AuditStore` (10.000 kayıt), rate-limit sayaçları, reputation seed | Analiz kayıtları | **Yeniden başlatmada sıfırlanır** |
| Sunucu diski | `BARET_DATA_DIR/keys.json` (mod 0600) | Anahtar özetleri + kullanım sayaçları | Yalnızca kalıcı diskte kalıcı (Render free'de değil) |
| Showcase `localStorage` | tema (`@stellar-thorn/ui`), `baret.devkey` (portalın anahtarı), `baret.sample-account` (Playground'un geçici testnet adresi) | Tercihler | Tarayıcı |
| Zincir (testnet) | passkey-kit smart wallet, `MerchantSpendPolicy` `(wallet, merchant)` satırları | Gerçek yetki/harcama durumu | Kalıcı |

---

## 7. Portlar, ortamlar, deploy

| Parça | Yerel | Canlı | Config dosyası |
|---|---|---|---|
| Sunucu | `pnpm dev:server` → :8080 (Docker: host :18080) | Render (`render.yaml`, free plan, Frankfurt) | `apps/server/.env(.example)` |
| Showcase | `pnpm dev:showcase` → :5175 (`/api` → :8080 proxy) | Vercel (`vercel.json`; `/api/*` → Render) | `apps/showcase/vite.config.ts` |
| Bağımsız cüzdan | `pnpm dev:wallet` → :5180 | Ayrı Vercel/Cloudflare projesi (elle) | - |
| Eklenti | `pnpm build:extension` → `dist/`, `dist-firefox/` (+ showcase `public/*.zip`) | Mağaza yok; `/install` zip verir | `manifest.config.ts` |
| API dokümanı | `cd baret_docs && npm run dev` → :3000 | Yok (henüz deploy tanımı yok) | - |
| Kontratlar | `cargo test --manifest-path contracts/Cargo.toml` | Testnet'te deploy edilmiş | `contracts/**/DEPLOYMENT.md` |

Deploy adımları: [`DEPLOY.md`](./DEPLOY.md). Ortam değişkenlerinin tam listesi: `apps/server/src/config/index.ts`
(şema) ve [`docs/architecture/server.md`](./docs/architecture/server.md#7-konfigürasyon).

Bağlantı noktaları arasındaki sabit URL'ler (değişince birlikte güncelle):
- Eklenti paketli build → `https://baret-stellar.onrender.com` (`background/baret/analyze-client.ts`), dev'de `http://localhost:8080`
- Showcase → `/api/...` (proxy/rewrite), portal snippet'leri → `PUBLIC_API_URL` (`pages/developers/api.ts`)
- Hem eklenti hem showcase analiz çağrısında herkese açık demo anahtarı **`dev-key-change-me`** gönderir
  (`render.yaml` `DELTAG_API_KEYS` ile eşleşir). Değiştirirsen üçünü birlikte değiştir.

---

## 8. Neden böyle bağlı

- **`swig-guard` SDK'sız (Stellar SDK import etmez).** Eklentiye ve bağımsız cüzdana paketlenir; tarayıcı
  paketinde `@stellar/stellar-sdk` çekmeden `TransactionGuard` ve policy şablonlarını kullanabilmek için.
  Bu yüzden Ed25519 attestation **doğrulaması** `swig-guard`'a değil, SDK'yı zaten kullanan `agent-guard`'a
  konuldu. Sonuç: eklenti attestation'ı henüz doğrulamıyor.
- **`ext-protocol` ayrı paket, `src` doğrudan export.** Popup, options, content ve background aynı tipleri
  derleme zamanında paylaşır. Mesaj adı/şekli değiştiğinde tüm yüzeyler birlikte tip hatası verir.
- **Eklenti, `swig-guard`'ın `GuardPolicy` tipini kullanır, sunucu kendi `policySchema`'sını.** Sunucu şeması
  `.passthrough()` olduğu için cüzdanın client-only kuralları aynen gönderilebilir. İki taraf elle senkron tutulur
  (`api/policy-schema.ts` ve `swig-guard/src/policy.ts`); bir test preset'leri karşılaştırır.
- **`wallet-adapter` yalnızca bağımsız cüzdan içindir.** dApp ↔ `apps/wallet` popup'ı `postMessage` ile
  konuşur. Eklenti bunu kullanmaz; eklenti `window.baretStellar` (Freighter uyumlu) sağlar. Showcase her ikisini
  de tanır (`wallet/standard-bridge.ts`: `window.baretStellar` + Freighter).
- **Akıllı cüzdan gerçek, ama yalnızca eklentide.** Eklenti hesap başına gerçek bir passkey-kit smart wallet
  deploy eder; `apps/wallet`'ta `smartWalletAddress` hâlâ authority adresinin **yer tutucusudur**
  (`wallet/smart-wallet.ts`, TODO).
- **Sunucu tek ağa bağlıdır.** Bir süreç ya testnet ya pubnet konuşur; farklı ağ isteyen istek `WRONG_NETWORK` alır.
- **Sunucu simülasyonu "tarihsel" değildir.** `POST /v1/replay` her zaman güncel durumla yeniden simüle eder
  (`isHistorical: false`).
- **İki x402 mekanizması** (bkz. 4.4) bilinçli ayrıdır: biri ürün (API'yi satmak), diğeri demo (savunmayı sergilemek).

---

## 9. İsimlendirme mirası

Kodda göreceğin ama artık anlamını yitirmiş isimler. Yeniden adlandırmak geniş bir değişikliktir, o yüzden yalnızca burada belgeli:

| İsim | Gerçek anlamı |
|---|---|
| `DELTAG_*` env öneki (`DELTAG_API_KEYS`, `DELTAG_AUTH_MODE`, `DELTAG_TRUST_PROXY`, `DELTAG_RATE_LIMIT_*`) | Sunucunun eski adı "DeltaG". Aktif ve gerekli, sadece adı eski |
| `BARET_*` env öneki | Yeni öğeler (`BARET_KEY_*`, `BARET_DATA_DIR`, `BARET_CORS_ORIGINS`, `BARET_SIGNING_SECRET`) |
| `@stellar-thorn/*` paket kapsamı | Eski marka "BLACKTHORN". Tüm workspace bunu kullanır |
| `swig-guard`, `apps/extension/src/background/swig/` | "Swig" Solana smart wallet'ıydı. Şimdi Stellar guard SDK'sı / passkey-kit smart wallet kodu |
| `packages/baret-adapter` dizini → `@stellar-thorn/wallet-adapter` paketi | Dizin adı ile paket adı farklı |
| `baret_docs` (paket adı `tailwind-plus-protocol`) | Tailwind Plus "Protocol" şablonundan türedi |
| `sub-key` / "swig sub-key" | Merchant başına smart wallet Ed25519 signer'ı (artık `MerchantSpendPolicy`'ye bağlı) |
| "thorn" glifi (eski docs) | Marka bugün "hard hat" (baret) işaretidir (`packages/ui/src/brand/Mark.tsx`) |

---

## 10. Derin dalış dokümanları

| Konu | Doküman |
|---|---|
| Doküman haritası + güncelleme protokolü | [`docs/README.md`](./docs/README.md) |
| Sunucu iç yapısı (pipeline, dedektörler, policy, auth, anahtarlar, x402, MCP, config) | [`docs/architecture/server.md`](./docs/architecture/server.md) |
| Paketler ve bağımlılıkları | [`docs/architecture/packages.md`](./docs/architecture/packages.md) |
| İstemciler (showcase, bağımsız cüzdan, portal, API doküman sitesi) | [`docs/architecture/clients.md`](./docs/architecture/clients.md) |
| Eklenti mimarisi (yüzeyler, mesajlar, DB, kripto) | [`docs/extension-architecture.md`](./docs/extension-architecture.md) |
| x402 savunması, attestation, zincir üstü alt anahtar | [`docs/x402-defense.md`](./docs/x402-defense.md) |
| Policy şeması ve nerede uygulandığı | [`docs/policy-dsl.md`](./docs/policy-dsl.md) |
| Cüzdan UX spec'i (+ gerçek durum) | [`docs/wallet-spec.md`](./docs/wallet-spec.md) |
| Spec ↔ gerçek farkı | [`docs/implementation-status.md`](./docs/implementation-status.md) |
| Kontratlar | [`contracts/README.md`](./contracts/README.md) |
| Bilinen sınırlar | [`LIMITATIONS.md`](./LIMITATIONS.md) |
| Deploy | [`DEPLOY.md`](./DEPLOY.md) |
| Sade dille özet | [`PROJE_OZETI.md`](./PROJE_OZETI.md) |
