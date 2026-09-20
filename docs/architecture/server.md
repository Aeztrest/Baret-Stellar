# Sunucu (`apps/server`): iç yapı

> Paket: `@stellar-thorn/server`. Fastify 5 + TypeScript (ESM, NodeNext), tek süreç, **tek ağ** (testnet ya da
> pubnet). Bu doküman koddan doğrulanmıştır (2026-09-19). Üst düzey resim için [`ARCHITECTURE.md`](../../ARCHITECTURE.md).
> HTTP sözleşmesinin makinece okunur kaynağı canlı **`GET /openapi.json`**'dır (`src/api/openapi.ts`); bu doküman
> onu tekrar etmez, iç işleyişi anlatır.

## İçindekiler

1. [Dizin haritası](#1-dizin-haritası)
2. [Başlatma](#2-başlatma)
3. [İstek yaşam döngüsü ve hook sırası](#3-istek-yaşam-döngüsü)
4. [Auth, anahtarlar, limitler, CORS](#4-auth-anahtarlar-limitler-cors)
5. [Uç noktalar](#5-uç-noktalar)
6. [Analiz pipeline'ı](#6-analiz-pipelineı)
7. [Konfigürasyon](#7-konfigürasyon)
8. [Dedektörler ve bulgu kodları](#8-dedektörler)
9. [Policy motoru](#9-policy-motoru)
10. [x402](#10-x402)
11. [MCP](#11-mcp)
12. [Audit ve reputation](#12-audit-ve-reputation)
13. [Attestation (imzalı karar)](#13-attestation)
14. [Hata zarfı](#14-hata-zarfı)
15. [Test, build, lint](#15-test-build-lint)
16. [Tuzaklar](#16-tuzaklar)

---

## 1. Dizin haritası

```
apps/server/src/
├── index.ts                     Giriş: keepAlive agent'ları, loadConfig, prod kontrolü, listen, SIGTERM
├── app.ts                       buildApp(): hook sırası, hata/404 işleyicileri, rota kaydı
├── config/index.ts              Zod env şeması + loadConfig() (geçersizse süreç HİÇ başlamaz)
├── api/
│   ├── auth.ts                  Auth hook, PUBLIC_ROUTES, resolveApiKey, rate-limit başlıkları
│   ├── cors.ts                  CORS hook (ilk onRequest)
│   ├── errors.ts                Hata zarfı + ApiErrorCode listesi
│   ├── extract-api-key.ts       Bearer/X-API-Key ayrıştırma + timing-safe karşılaştırma
│   ├── openapi.ts               Elle yazılmış OpenAPI 3.0 (GET /openapi.json)
│   ├── policy-schema.ts         POLICY_OPTIONS + POLICY_PRESETS (GET /v1/policy/schema)
│   ├── schemas/analyze.response.ts   Cevap Zod şeması (settlement'tan ÖNCE doğrulanır)
│   └── routes/                  health, analyze, batch(+stream), replay, audit, mcp, developer, demo-paywall, demo-cortex
├── application/analyze-transaction.ts   Ana orkestratör (§6)
├── simulation/                  tx-decode, account-keys, stellar-simulator, normalize-simulation, cpi-parser, replay
├── analysis/                    extract-deltas, instruction-decoder, suggestion-engine
├── risk/                        index.ts (runRiskDetection) + detectors/{account,simulation,programs,cpi,reputation,compute,deltas,x402}.ts
├── policy/                      engine.ts (evaluatePolicy), dsl.ts + profiles.ts (yalnız MCP profil listesi, bkz. §9.3)
├── domain/                      Tip sözleşmeleri: policy, decision, findings, estimated-changes, simulation-normalized,
│                                cpi-trace, instruction-summary, detector-catalog (herkese açık katalog)
├── keys/                        key-store.ts (kalıcı anahtar deposu), limiter.ts (sabit pencere sayaç)
├── attestation/                 signing-key.ts, sign-verdict.ts
├── data/                        audit-store.ts (bellek), reputation-db.ts (seed)
├── infra/                       stellar-rpc.ts (Horizon+Soroban adapter), x402.ts (+fastify adapter), logger.ts
├── x402/                        facilitator-client.ts, merchant-config.ts (demo satıcı)
├── mcp/server.ts                MCP araç tanımları + çağrı
├── scripts/x402-setup.ts        Tek seferlik satıcı anahtarı/USDC trustline kurulumu
└── scripts/chain-check.ts       Testnet canlılık kontrolü: MerchantSpendPolicy çalışıyor mu, smart-wallet wasm ve USDC var mı (çıkış kodu 1 = sorun)
```

## 2. Başlatma

`index.ts`:
1. `http/https.globalAgent` → `keepAlive` (soğuk TLS el sıkışması analiz gecikmesinin en büyük tek kalemiydi).
2. `loadConfig()`; hata → süreç açılmaz.
3. **Prod kontrolü:** `NODE_ENV=production` iken `DELTAG_API_KEYS` (en az bir statik anahtar) **ya da**
   `X402_ENABLED`+`X402_PAY_TO` yoksa hata verir. Yani yalnızca "üretilmiş anahtarlarla" çalışan bir prod
   deploy'u için de en az bir statik anahtar gerekir.
4. `buildApp(config)`, `SIGTERM/SIGINT` → `app.close()` (anahtar deposu son sayaçlarını diske yazar), `listen(0.0.0.0:PORT)`.

`app.ts` sırayla: `KeyStore` + limiter'lar → CORS hook → `x-request-id` (`onSend`) → IP rate limit → RPC adapter
(süreç başına **tek** `StellarRpcAdapter`) → auth hook → kullanım sayacı (`onResponse`) → hata/404 işleyicisi →
x402 (etkinse) → imza anahtarı → rotalar.

## 3. İstek yaşam döngüsü

1. **CORS** (`onRequest`, ilk): `Origin` varsa uygun başlıkları ekler; `OPTIONS` preflight'ı 204 ile burada bitirir.
   Böylece 401/429 cevapları da CORS başlığı taşır (tarayıcı aksi halde opak "network error" görür).
2. **IP rate limit** (`@fastify/rate-limit`, `DELTAG_RATE_LIMIT_MAX`, 0 = kapalı; `/health*` muaf). Aşılırsa 429 `RATE_LIMITED`.
   `X-RateLimit-*` başlıklarını bilerek **yazmaz** (onlar anahtar bütçesine aittir), yalnız `Retry-After`.
3. **Auth** (`onRequest`): yalnızca `/v1/*` ve `/mcp/*`. Ayrıntı §4.
4. Rota işleyicisi.
5. `onResponse`: üretilmiş anahtar + rota + status≠429 ise `keyStore.recordUsage(id, "METHOD /rota")`.
6. `setErrorHandler`: 429→`RATE_LIMITED`, 413→`PAYLOAD_TOO_LARGE`, diğer 4xx→`BAD_REQUEST`, kalanı `INTERNAL_ERROR`
   (ham mesajı **asla** döndürmez, RPC URL'i sızdırabilir). `setNotFoundHandler` → 404 `NOT_FOUND`.

Her cevap `x-request-id` (UUID) taşır. Loglar pino'dur; `authorization` ve `x-api-key` başlıkları loglardan silinir.

## 4. Auth, anahtarlar, limitler, CORS

### 4.1 Kim geçer

`api/auth.ts` **varsayılan kapalıdır**: `/v1/*` ve `/mcp/*` altındaki her rota anahtar ister, yalnızca
`PUBLIC_ROUTES`'taki tam `METHOD yol` eşleşmeleri muaftır:

```
GET /v1/meta · GET /v1/detectors · GET /v1/policy/schema · POST /v1/keys (kendi throttle'ı + issuance şalteri)
```

`/`, `/openapi.json`, `/health*`, `/demo/*` `/v1`/`/mcp` altında olmadığı için hiç auth görmez (herkese açık).
Yeni bir rota ekleyince otomatik korunur; herkese açmak için bilerek `PUBLIC_ROUTES`'a eklenmelidir.

Kimlik bilgisi: `Authorization: Bearer <anahtar>` **veya** `X-API-Key: <anahtar>`.

| Anahtar türü | Kaynak | Dakikalık limit | Kullanım sayacı |
|---|---|---|---|
| **static** | `DELTAG_API_KEYS` (virgüllü) | yok (yalnız IP limiti) | tutulmaz |
| **issued** | `POST /v1/keys` → `baret_…` | `BARET_KEY_RATE_LIMIT_PER_MIN` (60) | toplam, günlük (30 gün), uç nokta başı |

Statik anahtar `timingSafeEqual` ile (SHA-256 özetleri üzerinden, uzunluk sızdırmadan) karşılaştırılır.

### 4.2 Auth modları (`DELTAG_AUTH_MODE`)

`api_key` (varsayılan) / `x402` / `both`. Türetme (`config/index.ts`): `X402_ENABLED` kapalıysa mod her zaman
`api_key`. Açıksa ve mod verilmediyse `both` (statik anahtar varsa) ya da `x402`.
**x402 yalnızca `POST /v1/analyze` içindir** (`isGatedByX402Instead`): geçersiz/eksik anahtarlı bu istek 401 yerine
ödeme katmanına gider. Başka hiçbir rota x402 ile açılmaz. `both`'ta geçerli bir anahtar ödemeyi atlar
(`onProtectedRequest`; üretilmiş anahtarlar da sayılır).

### 4.3 Anahtar deposu (`keys/key-store.ts`)

- Format: `baret_` + 24 rastgele bayt (base64url). Görünen önek: ilk 10 karakter. Kimlik: `key_<16 hex>`.
- **Düz metin yalnızca oluşturulurken bir kez döner.** Depoda SHA-256 özeti tutulur; sızan dosya kimlik bilgisi olarak kullanılamaz.
- Kalıcılık: tek dosya `BARET_DATA_DIR/keys.json` (`./data` varsayılan; `NODE_ENV=test`'te yalnız bellek), atomik yazım
  (tmp + rename), mod `0600`. Klasör yazılamazsa **bellekte çalışmaya devam eder** ve bir kez uyarı loglar
  (`persistent:false`). Okunamayan dosya `keys.json.corrupt-<ts>` diye kenara alınır, üzerine yazılmaz.
- Üst sınır `BARET_MAX_ISSUED_KEYS` (10.000), dolunca `POST /v1/keys` → 503 `UNAVAILABLE`.
- Kullanım günlük sayaçları 30 günden eskiyse budanır. Yazma 2 sn debounce'lu, kapanışta zorlanır.
- **Ephemeral disk uyarısı:** Render free gibi hostlarda `keys.json` her yeniden başlatmada silinir; kalıcı disk/volume gerekir (bkz. `DEPLOY.md`, `LIMITATIONS.md`).

### 4.4 Limitler

| Limit | Anahtar | Varsayılan | Yer |
|---|---|---|---|
| IP başına genel | `DELTAG_RATE_LIMIT_MAX` / `_WINDOW_MS` | 200 / 60 sn | `@fastify/rate-limit` |
| Anahtar başına | `BARET_KEY_RATE_LIMIT_PER_MIN` | 60/dk | `FixedWindowLimiter` (bellek) |
| IP başına anahtar üretimi | `BARET_KEY_ISSUE_PER_IP_PER_HOUR` | 5/saat | `FixedWindowLimiter` (bellek) |
| Gövde boyutu | `MAX_BODY_BYTES` | 1 MiB | Fastify `bodyLimit` |

Sabit pencere sayaçları **süreç içidir**; çok örnekli deploy'da gerçek limit uç katmanda (gateway/CDN) uygulanmalıdır.
Reddedilen istek sayılmaz (kilitlenme uzamaz). Batch/stream, işlem sayısı kadar hak tüketir (`chargeBatch`).
`DELTAG_TRUST_PROXY` açıkken IP `X-Forwarded-For`'dan alınır; platform istemci başlığını olduğu gibi geçiriyorsa IP sahteciliği mümkündür.

### 4.5 CORS (`api/cors.ts`)

Çerez kullanılmadığı için `Access-Control-Allow-Origin: *` güvenlidir (başka origin yalnızca elindeki anahtarı kullanabilir).
`BARET_CORS_ORIGINS` (`*` ya da virgüllü liste) verilirse yalnızca o origin'ler yansıtılır (`Vary: Origin`).
Tarayıcının **okuyabildiği** başlıklar: `x-request-id`, `x-ratelimit-*`, `retry-after`, `payment-required`, `payment-response`, `x-payment-response`.
İzin verilen metotlar: `GET, POST, DELETE, OPTIONS`.

## 5. Uç noktalar

| Metot | Yol | Auth | Ne yapar |
|---|---|---|---|
| GET | `/` | yok | Ad, sürüm (`API_VERSION`), ağ, keşif linkleri |
| GET | `/openapi.json` | yok | Canlı OpenAPI 3.0 (`buildOpenApi`, 60 sn cache, `Vary: Host`) |
| GET | `/health` | yok | `{status:"ok"}` (rate-limit muaf) |
| GET | `/health/ready` | yok | Soroban RPC `getNetwork` + passphrase kontrolü (+ x402 açıksa facilitator `getSupported`); 200 `ready` / 503 `degraded` |
| GET | `/v1/meta` | yok | Ağ, USDC, auth modları, limitler, x402, attestation `signerPublicKey` |
| GET | `/v1/detectors` | yok | `DETECTOR_CATALOG` (`?status=active|reserved`, `?category=`) |
| GET | `/v1/policy/schema` | yok | `POLICY_OPTIONS`, `POLICY_PRESETS`, notlar |
| POST | `/v1/keys` | yok (+throttle) | Ücretsiz anahtar üret (`{name}`), `403` issuance kapalıysa |
| GET/DELETE | `/v1/keys/me` | anahtar | Anahtarın kullanımı / iptali (yalnız üretilmiş anahtarlar) |
| POST | `/v1/decode` | anahtar | RPC'siz, simülasyonsuz çözümleme: hash, kaynak, ücret, memo, timeBounds, özet, cpiTrace |
| POST | `/v1/analyze` | anahtar **veya x402** | Ana analiz (§6) |
| POST | `/v1/analyze/batch` | anahtar | ≤25 işlem paralel; `{count, results[{index,status,decision|error}], summary}` |
| POST | `/v1/analyze/stream` | anahtar | SSE: `start` → `result`(×N) → `complete` |
| GET | `/v1/analyze/stream` | anahtar | Geriye uyum: `connected` + `error` olayı (nereye POST edileceğini söyler) |
| POST | `/v1/replay` | anahtar | Güncel durumla yeniden simülasyon: `{simulation, replayLedger, replayedAt, isHistorical:false}` |
| GET | `/v1/audit/recent` | anahtar | Son kayıtlar (`?limit`, ≤200) |
| GET | `/v1/audit/aggregate` | anahtar | Toplam/güvenli/bloklu, top risk kodları, top bloklanan kontratlar (`?since`) |
| GET | `/v1/audit/contract/:contractAddress` | anahtar | Kontrat bazlı istatistik + son kayıtlar |
| GET | `/mcp/tools` · POST `/mcp/call` | anahtar | MCP araçları (§11) |
| GET | `/demo/scrybe`, `/demo/cortex` | yok | x402 satıcı demoları (yalnız `X402_MERCHANT_SECRET` varsa kayıtlı) |

Not: audit kayıtları **süreç geneldir**, anahtar bazlı ayrılmaz. Herhangi bir geçerli anahtar başkalarının
`userWallet`/kontrat verisini görür (bkz. [`LIMITATIONS.md`](../../LIMITATIONS.md)).

## 6. Analiz pipeline'ı

`application/analyze-transaction.ts` → `analyzeTransaction(body, deps)`:

| # | Adım | Modül | Not |
|---|---|---|---|
| 1 | Ağ kontrolü | - | `body.network ≠ config.stellar.network` → `WrongNetworkError` (400 `WRONG_NETWORK`) |
| 2 | XDR çöz | `simulation/tx-decode.ts` | Geçersizse `AnalyzeValidationError("Invalid transaction XDR")`; fee-bump → iç işlem |
| 3 | `userWallet` doğrula | - | Verilmişse geçerli `G…` olmalı |
| 4 | Hesap/kontrat/varlık topla | `simulation/account-keys.ts` | `MAX_SIMULATION_OPERATIONS`'a kırpılırsa `truncatedAccounts` → düşük güven |
| 5 | Simüle et | `simulation/stellar-simulator.ts` | Horizon `loadAccount`'lar **paralel** + (Soroban op'u varsa) `simulateTransaction`. Preflight'tan önce auth girdileri temizlenir |
| 6 | Delta çıkar | `analysis/extract-deltas.ts` | native/asset/trustline/allowance; `approve` op gövdesinden doğrudan da okunur. `changeTrust` hedefi SDK'da `line` alanındadır (`account-keys.ts` `changeTrustAsset`); likidite havuzu payı trustline'ı tek varlık taşımadığı için trustline dedektörlerine düşmez |
| 7 | Auth ağacı + özet | `simulation/cpi-parser.ts`, `analysis/instruction-decoder.ts` | Ağaç derinlik 64 / düğüm 5.000'de kesilir (`truncated`) |
| 8 | Dedektörler | `risk/index.ts` | §8 |
| 9 | Policy | `policy/engine.ts` | §9 |
| 10 | Öneriler | `analysis/suggestion-engine.ts` | Bloklamaz; `suggestions` |
| 11 | Attestation | `attestation/sign-verdict.ts` | Yalnız `BARET_SIGNING_SECRET` varsa |
| 12 | Audit | `data/audit-store.ts` | Best-effort (hata yutulur) |

Simülasyon detayları: `NormalizedSimulation` (`status`, `preflighted`, `accounts`, `events`, `feeStroops`,
`minResourceFeeStroops`, `authEntries`, `hostFnResultsXdr`). Yalnız-klasik işlemde `preflighted:false` olur ve bu
tek başına bulgu **üretmez** (etkisi op'tan bellidir); Soroban op'u olup preflight yoksa `LOW_CONFIDENCE_INCOMPLETE_DATA` üretilir.
Horizon 404 → "henüz fonlanmamış" hesap taslağı. RPC hataları `StellarRpcError` (`RPC_TIMEOUT`→504, diğer→502 `RPC_ERROR`).
RPC çağrısı başına sert zaman aşımı `STELLAR_RPC_TIMEOUT_MS` (5 sn), **otomatik yeniden deneme yok**
(eskiden yeniden deneme en kötü durumu ikiye katlıyordu; istemcinin kendi "Retry" düğmesi var).

`decision.meta.confidence`: `low` (LOW_CONFIDENCE bulgusu ya da simülasyon başarısız), `medium` (preflight yok), `high`.

Cevap: `Decision` = `{safe, reasons, estimatedChanges, riskFindings, simulationWarnings, annotation{summary,cpiTrace}, suggestions, meta, attestation?}`.
`simulationWarnings` şu an her zaman boştur (Soroban diagnostic event'leri insan okur metin değildir). Cevap,
`analyzeResponseSchema` ile doğrulanır; **x402 settlement bundan sonra** yapılır, doğrulama başarısızsa ödeme kesinleşmez.

## 7. Konfigürasyon

Kaynak: `src/config/index.ts` (Zod). Geçersiz/eksik → süreç açılmaz. Dev'de `tsx watch --env-file=.env`; prod'da
platformun env'i (dotenv yok). Örnekler: `apps/server/.env.example`, `.env.production.example`.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `NODE_ENV` | `development` | `development`/`test`/`production` |
| `PORT` | 8080 | Dinleme portu |
| `LOG_LEVEL` | `info` | `fatal`…`trace` |
| `STELLAR_NETWORK` | `testnet` | `testnet` / `pubnet` (sunucu tek ağa bağlı) |
| `STELLAR_HORIZON_URL` | **zorunlu** | Horizon URL |
| `STELLAR_SOROBAN_RPC_URL` | **zorunlu** | Soroban RPC URL |
| `STELLAR_USDC_ISSUER` / `STELLAR_USDC_CODE` | Circle issuer / `USDC` | Klasik USDC tanımı; SAC adresi ağa göre sabit gömülü |
| `RISKY_CONTRACT_IDS` | boş | `C…` listesi → `RISKY_CONTRACT_INTERACTION` |
| `KNOWN_SAFE_CONTRACT_IDS` | boş | Doluysa listede olmayan her kontrat `UNKNOWN_CONTRACT_EXPOSURE` |
| `MAX_SIMULATION_OPERATIONS` | 20 (1-100) | Ön-duruma alınacak en fazla hesap |
| `MAX_BODY_BYTES` | 1.048.576 | Gövde sınırı |
| `REQUEST_TIMEOUT_MS` | 15000 | Fastify dış istek bütçesi (emniyet ağı) |
| `STELLAR_RPC_TIMEOUT_MS` | 5000 | Tek Horizon/Soroban çağrısı zaman aşımı |
| `DELTAG_API_KEYS` | boş | Statik anahtarlar (virgüllü) |
| `DELTAG_AUTH_MODE` | türetilir | `api_key`/`x402`/`both` (§4.2) |
| `DELTAG_RATE_LIMIT_MAX`, `DELTAG_RATE_LIMIT_WINDOW_MS` | 200 / 60000 | IP limiti (`MAX=0` = kapalı) |
| `DELTAG_TRUST_PROXY` | kapalı | `1/true/yes` → `X-Forwarded-For` |
| `BARET_KEY_ISSUANCE` | `open` (saf x402'de `closed`) | `POST /v1/keys` şalteri |
| `BARET_KEY_RATE_LIMIT_PER_MIN` | 60 | Anahtar başına dk. limiti |
| `BARET_KEY_ISSUE_PER_IP_PER_HOUR` | 5 | IP başına saatlik üretim |
| `BARET_MAX_ISSUED_KEYS` | 10000 | Toplam üst sınır |
| `BARET_DATA_DIR` | `./data` (test: bellek) | `keys.json` klasörü |
| `BARET_CORS_ORIGINS` | `*` | `*` ya da virgüllü origin listesi |
| `X402_ENABLED` | kapalı | `1/true/yes` → `/v1/analyze` ödemeli |
| `X402_PAY_TO` | - | Etkinse **zorunlu**, geçerli `G…`/`C…` |
| `X402_NETWORK` | `stellar:<ağ>` | CAIP-2 |
| `X402_FACILITATOR_URL` | `https://www.x402.org/facilitator` | Hem paywall hem demo satıcı bunu kullanır |
| `X402_ANALYZE_PRICE` | `$0.001` | Analiz başı fiyat |

`config/index.ts` **dışında** doğrudan `process.env`'den okunanlar:

| Değişken | Nerede | Etki |
|---|---|---|
| `X402_MERCHANT_SECRET` | `x402/merchant-config.ts` | `S…` seed. **Yoksa `/demo/scrybe` ve `/demo/cortex` hiç kayıt olmaz** (404) |
| `X402_DEMO_NETWORK` | aynı | `stellar:testnet` (varsayılan) / `stellar:pubnet` |
| `X402_DEMO_PRICE_ATOMIC` | aynı | Soru başı fiyat, 7 ondalık atomik (**varsayılan 10000 = 0,001 USDC**) |
| `BARET_SIGNING_SECRET` | `attestation/signing-key.ts` | `S…` seed; verilirse her analiz cevabı Ed25519 ile imzalanır |

## 8. Dedektörler

`risk/index.ts → runRiskDetection` tüm dedektörleri sırayla çalıştırıp bulguları birleştirir. Her bulgu
`{code, severity: low|medium|high, message, details?}`. **Bulgu tek başına bloklamaz**; bloklama için ilgili
policy bayrağı gerekir (aşağıdaki "Policy bayrağı" sütunu). Kaynak katalog: `domain/detector-catalog.ts`
(`Record<RiskFindingCode, …>` olduğundan yeni kod eklemek katalog yazmadan derlenmez), canlı görünüm `GET /v1/detectors`.

| Kod | Kategori | Severity | Durum | Policy bayrağı |
|---|---|---|---|---|
| `SIMULATION_FAILED` | simulation | high | aktif | `requireSuccessfulSimulation` (varsayılan **açık**) |
| `LOW_CONFIDENCE_INCOMPLETE_DATA` | simulation | medium/high | aktif | `allowWarnings` (false iken **bloklar**) |
| `SIMULATION_ERROR` | simulation | high | rezerve | - |
| `RISKY_CONTRACT_INTERACTION` | contracts | high | aktif | `blockRiskyContracts` |
| `UNKNOWN_CONTRACT_EXPOSURE` | contracts | medium | aktif (yalnız known-safe listesi doluysa) | `blockUnknownContractExposure` (`allowWarnings:true` iptal eder) |
| `KNOWN_MALICIOUS_ADDRESS` | contracts | low/medium/high | aktif (küçük seed liste) | yok (bilgilendirici) |
| `SUSPICIOUS_CONTRACT_AGE` | contracts | medium | rezerve | - |
| `ACCOUNT_MERGE_DETECTED` | account | high | aktif | `blockAccountMerge` |
| `MASTER_KEY_REMOVED` | account | high | aktif | `blockMasterKeyRemoval` |
| `SIGNER_CHANGE_DETECTED` | account | high (yetki verir)/medium (siler) | aktif | `blockSignerChanges` |
| `THRESHOLD_CHANGE_DETECTED` | account | medium | aktif | `blockSignerChanges` |
| `SET_OPTIONS_RISKY` | account | medium | aktif (flag değişimi) | yok |
| `TRUSTLINE_CHANGE_DETECTED` / `TRUSTLINE_REMOVED` | trustline | medium | aktif | `blockTrustlineChanges` |
| `UNLIMITED_TRUSTLINE` | trustline | high | aktif (limit ≥ int64 max) | `blockUnlimitedTrustlines` |
| `SOROBAN_ALLOWANCE_GRANTED` | allowance | medium | aktif | `blockSorobanAllowanceGrants` |
| `SOROBAN_ALLOWANCE_UNLIMITED` | allowance | high | aktif (miktar ≥ 2^96) | `blockSorobanAllowanceGrants` |
| `POST_BALANCE_TOO_LOW` | balance | high | aktif (policy motoru üretir) | `minPostUsdcBalance` |
| `ESTIMATED_LOSS_EXCEEDS_MAX` / `LOSS_PERCENT_UNAVAILABLE` | balance | high | aktif (policy motoru) | `maxLossPercent` |
| `DEEP_SUB_INVOCATION_NESTING` | auth-tree | medium | aktif (derinlik ≥ 5) | yok |
| `HIGH_OPERATION_COUNT` | auth-tree | medium | aktif (≥ 20 çağrı) | yok |
| `UNSIGNED_AUTH_ENTRY` | auth-tree | medium | rezerve | - |
| `EXCESSIVE_RESOURCE_FEE` | fees | medium (varsayılan tavan)/high (policy tavanı) | aktif (varsayılan 5 XLM) | yok (danışma) |
| `EXCESSIVE_BASE_FEE` | fees | medium/high | aktif (varsayılan 0,1 XLM) | yok (danışma) |
| `X402_MEMO_MISSING` | x402 | medium | aktif | `requireMemo` (yalnız bulgu ekler) |
| `X402_DESTINATION_MISMATCH` / `X402_ASSET_MISMATCH` | x402 | high | aktif (`paymentRequirements` verilirse) | yok |
| `X402_NON_CANONICAL_ASSET` | x402 | medium | aktif | `allowedAssets` (yalnız bulgu ekler) |
| `X402_SHAPE_INVALID`, `X402_AMOUNT_MISMATCH`, `X402_FACILITATOR_MISMATCH` | x402 | high | rezerve | - |

Dedektör dosyaları: `account.ts` (yalnız op yapısına bakar, RPC gerektirmez), `simulation.ts`, `programs.ts`,
`cpi.ts`, `reputation.ts` (reputation DB'ye G…/C… adresleri sorar), `compute.ts` (ücretler), `deltas.ts`
(trustline/allowance + eksik veri), `x402.ts`.

## 9. Policy motoru

### 9.1 Şema

`domain/policy.ts` (`policySchema`, Zod, `.passthrough()`). İstemci-özel kurallar (`x402HourlyCap` vb.) reddedilmez,
yok sayılır. Sunucunun **uyguladığı** alanlar:

`maxLossPercent`, `minPostUsdcBalance` (+`minPostAsset`), `blockTrustlineChanges`, `blockUnlimitedTrustlines`,
`blockSorobanAllowanceGrants`, `blockRiskyContracts`, `blockUnknownContractExposure`, `blockAccountMerge`,
`blockSignerChanges`, `blockMasterKeyRemoval`, `allowWarnings`, `requireSuccessfulSimulation`, `requireMemo`,
`maxResourceFeeStroops`, `maxBaseFeeStroops`, `allowedAssets`.

İnsan okur açıklama + uyarılar `api/policy-schema.ts` (`GET /v1/policy/schema`). Cüzdan tarafındaki tam `GuardPolicy` ve
hangi alanın nerede uygulandığı: [`docs/policy-dsl.md`](../policy-dsl.md). Server preset'leri (strict/balanced/permissive)
`swig-guard` şablonlarının sunucu alt kümesidir.

### 9.2 Karar mantığı (`policy/engine.ts`)

`evaluatePolicy` bayrakları bulgulara uygular ve `reasons` üretir; `safe = !blocked`:

- Simülasyon başarısız + `requireSuccessfulSimulation !== false` → blok.
- Her `block*` bayrağı, ilgili bulgu koduna bağlıdır (§8 tablosu).
- `maxLossPercent` (yalnız **native XLM**, `userWallet` gerekli): kayıp yüzdesi `bigint` ile hesaplanır (>900M XLM'de bile hassas).
  `userWallet` ya da pre-state yoksa **blok** (fail-closed, `LOSS_PERCENT_UNAVAILABLE`).
- `minPostUsdcBalance`: varsayılan varlık ağın USDC'si (klasik `USDC:G…` ya da `C:<SAC>`); projeksiyon yoksa blok.
- `LOW_CONFIDENCE_INCOMPLETE_DATA` var ve `allowWarnings !== true` → blok. (Bu yüzden **boş policy** eksik veride bloklar.)
- Danışma bulguları (`requireMemo`, ücret tavanları, `allowedAssets`, `KNOWN_MALICIOUS_ADDRESS`, auth-tree) `safe`'i değiştirmez.

### 9.3 İkincil DSL ve profiller (bağlı değil)

`policy/dsl.ts` (`evaluateRules`: `eq/neq/gt/lt/gte/lte/in/not_in/contains/exists`; aksiyon `allow/block/warn`) ve `policy/profiles.ts`
(`strict`, `defi-permissive`, `monitor-only`) **ana analiz yoluna bağlı değildir.** `/v1/analyze` `policyProfile` alanını kabul etmez
(Zod bilinmeyen alanı sessizce atar); MCP `baret_analyze` şeması `policyProfile` ilan eder ama `handleAnalyze` onu **yok sayar**
(`policy: {}` kullanır). Profiller yalnızca `baret_list_profiles` çıktısında görünür.

## 10. x402

Bkz. [`ARCHITECTURE.md` §4.4](../../ARCHITECTURE.md#44-x402-satıcı-tarafı-sunucu).

- **Analiz paywall'ı** (`infra/x402.ts`, `createDeltagX402`): `@x402/core` `x402HTTPResourceServer` + `@x402/stellar` `ExactStellarScheme`.
  Yalnızca `POST /v1/analyze`. `preHandlerAnalyze` ödemeyi doğrular (`payment-error` → 402/başlıklar, facilitator hatası → 502
  `FACILITATOR_ERROR`); `settleAfterSuccess` yalnız analiz + cevap doğrulaması başarılıysa çağrılır. `FastifyX402HttpAdapter`
  `X-PAYMENT` başlığını `PAYMENT-SIGNATURE`'a eşler.
  Settlement sonrası hata, "ödendi ama hata döndü" olabileceğinden ayrı loglanır (`logX402SettlementOutcome`).
- **Demo satıcı** (`api/routes/demo-paywall.ts`, `demo-cortex.ts`): elle yazılmış `FacilitatorClient` (`/supported`, `/verify`, `/settle`,
  1 sa. `/supported` cache'i). `GET /demo/scrybe?q=` gerçek 402 + `PAYMENT-REQUIRED` (base64) döner; `PAYMENT-SIGNATURE` gelince verify → settle.
  `/demo/cortex` aynı akış + `scenario=safe|drift|asset-swap|blind` (drift: 0,25 USDC/çağrı; blind: 2,5 USDC; asset-swap: native XLM SAC).
  Sunucu **hiç yalan söylemez**: `accepted.amount` her zaman gerçekte imzalanıp settle edilen tutardır; "blind" senaryonun yalanı showcase sayfasındadır.
- **Kurulum:** `pnpm --filter @stellar-thorn/server x402-setup` merchant anahtarını üretir/`.env`'e yazar, testnet'te fonlar, USDC trustline ekler.
  (Soroban SAC `transfer` alıcıda trustline yoksa `Contract #13` ile düşer.) **Render'da `X402_MERCHANT_SECRET` elle girilmelidir** (`sync:false`).

## 11. MCP

`mcp/server.ts`, rotalar `api/routes/mcp.ts`. `GET /mcp/tools` araç tanımlarını, `POST /mcp/call` `{tool, arguments}` çağrısını işler
(hata → **422**). Araçlar: `baret_analyze` (metin biçiminde özet döner; `policy` boş), `baret_health`, `baret_list_profiles`.
İki uç da anahtar ister.

## 12. Audit ve reputation

- `AuditStore`: son **10.000** kayıt bellekte (`id, timestamp, network, safe, confidence, riskCodes, contractAddresses, primaryAction,
  userWallet, integratorRequestId, durationMs`) + kontrat başına istatistik (LRU, en fazla 10.000 kontrat). Kalıcı değil, süreç geneli, anahtardan bağımsız.
- `ReputationDatabase`: bellek içi seed (şu an tek örnek kayıt). `addEntry/addBatch` API'si var, dışarıdan beslenmiyor.

## 13. Attestation

`BARET_SIGNING_SECRET` (Stellar `S…` seed) verilirse her `Decision`'a `attestation: {signature, signerPublicKey, signedAt, nonce}` eklenir.
İmza, `txHash|safe|sha256(stableStringify(riskFindings))|signedAt|nonce` üzerinde Ed25519'dur. **`txHash` cevapta dönmez**: doğrulayan kendi
gönderdiği XDR'dan türetir, böylece sahte sunucu başka işlem için gerçek imza atamaz. Kurallar `sign-verdict.ts`'te; **doğrulama tarafı
`packages/agent-guard/src/attestation.ts`'te birebir kopyadır**, biri değişirse diğeri de değişmelidir. Sunucu açık anahtarı `GET /v1/meta →
attestation.signerPublicKey` ile yayınlar. Ayrıntı ve bilinen açık: [`docs/x402-defense.md`](../x402-defense.md) §10.

## 14. Hata zarfı

Her hata: `{ "error": { "code", "message", "details?" } }`. Kodlar (`api/errors.ts`, `openapi.ts`'teki `ErrorCode` ile testle eşitlenir):
`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `WRONG_NETWORK`, `RPC_ERROR`,
`FACILITATOR_ERROR`, `UNAVAILABLE`, `INTERNAL_ERROR`. HTTP eşleşmesi: 400 (`BAD_REQUEST`, `WRONG_NETWORK`), 401, 403, 404, 413, 429 (+`Retry-After`),
502/504 (`RPC_ERROR`; zaman aşımı 504), 502 (`FACILITATOR_ERROR`), 503, 500.
İstisnalar: `/demo/*` rotaları bu zarfı kullanmaz (`{error: "..."}`), `/mcp/call` eksik `tool` için `{error:"Missing 'tool' field"}` döner.
Sızıntı kuralları: analiz sonucu kendi cevap şemasını geçemezse `500 INTERNAL_ERROR` "Response validation failed" döner ve şema ayrıntısı (`issues`) yalnız loga yazılır; istek gövdesi hatasında (`400`) `details.issues` kalır, çünkü çağıranın kendi girdisidir. Demo satıcılar facilitator'a ulaşamazsa (`buildRequirements`) `502 {error: "Couldn't build payment requirements"}` döner, facilitator URL'i yalnız logdadır (verify/settle sebepleri `detail` olarak bilerek dönmeye devam eder, showcase onları gösterir).

## 15. Test, build, lint

```bash
pnpm --filter @stellar-thorn/server test        # vitest run (test/**), ağa ihtiyaç duymaz
pnpm --filter @stellar-thorn/server lint        # tsc --noEmit
pnpm --filter @stellar-thorn/server build       # tsc -p tsconfig.build.json → dist/
```

Testler `test/` altında: `app-auth`, `api/{developer,openapi,error-sanitization,analyze-x402-log,analyze-response-check,demo-routes,portal-catalog}`, `keys/key-store`,
`policy/engine`, `risk/*`, `simulation/*`, `analysis/extract-deltas`, `attestation/*`, `data/audit-store`, `domain/finding-codes`, `chain-check` (sunucu `scripts/` betiğinin sınıflandırma mantığı). Önemli kilitler:
`openapi.test.ts` (her kayıtlı rota OpenAPI'de olmalı, hata kodları eşit olmalı), `portal-catalog.test.ts` (showcase portal kataloğu ↔ OpenAPI),
`finding-codes.test.ts` (sunucu bulgu kodları ↔ swig-guard `RISK_FINDING_CODES`).

## 16. Tuzaklar

- **`DELTAG_*` adı eski ama zorunlu.** Yeniden adlandırma `render.yaml`, `docker-compose.yml`, docs, `.env` dosyalarını birlikte gerektirir.
- **Boş policy blok eder.** `{}` gönderen bir istemci Soroban simülasyonu başarısızsa ya da veri eksikse `safe:false` alır.
- **Yalnız-klasik işlemde güven `medium`**, Soroban op'unda preflight başarılıysa `high`.
- **`replay` tarihsel değildir** ve `Decision` değil `simulation` döner.
- **Demo rotaları `/v1` dışındadır**: auth yok, hata zarfı farklı, `X402_MERCHANT_SECRET` yoksa yoklar.
- **Anahtar deposu ephemeral diskte kaybolur**; `GET /v1/meta` `persistent:true` demesi diskin restart'a dayanacağı anlamına gelmez.
- **x402 için iki ayrı kod yolu var**: paywall `@x402/core` istemcisini, demo satıcı elle yazılmış `FacilitatorClient`'ı kullanır; ikisi de aynı `X402_FACILITATOR_URL`'i okur. Birini düzeltirken diğerini de kontrol et.
