# BARET — Sistem Mimarisi

Bu doküman BARET'un mevcut **Stellar** implementasyonunu modül modül açıklar: veri akışı, simülasyon, risk tespiti, policy motoru ve istemci tarafı (SDK, eklenti, cüzdan). Kaynak doğrulu: `apps/server/src`, `packages/*/src`, `apps/{extension,wallet,showcase}/src`.

---

## İçindekiler

1. [Proje Nedir?](#1-proje-nedir)
2. [Monorepo & Genel Mimari](#2-monorepo--genel-mimari)
3. [Sunucu Başlatma Akışı](#3-sunucu-başlatma-akışı)
4. [Konfigürasyon Sistemi](#4-konfigürasyon-sistemi)
5. [Bir İsteğin Hayat Döngüsü](#5-bir-isteğin-hayat-döngüsü)
6. [Transaction Decode (XDR)](#6-transaction-decode-xdr)
7. [Hesap Toplama & Simülasyon](#7-hesap-toplama--simülasyon)
8. [Tahmini Değişimler (Delta Extraction)](#8-tahmini-değişimler-delta-extraction)
9. [Soroban Auth Ağacı & Operasyon Decode](#9-soroban-auth-ağacı--operasyon-decode)
10. [Risk Tespit Sistemi](#10-risk-tespit-sistemi)
11. [Policy Motoru](#11-policy-motoru)
12. [Öneri Motoru](#12-öneri-motoru)
13. [Audit Trail & Reputation](#13-audit-trail--reputation)
14. [Batch, Streaming, Replay](#14-batch-streaming-replay)
15. [MCP Server](#15-mcp-server)
16. [x402 Ödeme Sistemi](#16-x402-ödeme-sistemi)
17. [swig-guard SDK](#17-swig-guard-sdk)
18. [Wallet Adapter & Browser Extension](#18-wallet-adapter--browser-extension)
19. [Bağımsız Cüzdan (apps/wallet)](#19-bağımsız-cüzdan-appswallet)
20. [API Endpoint'leri](#20-api-endpointleri)
21. [Veri Modelleri](#21-veri-modelleri)
22. [Dosya Haritası](#22-dosya-haritası)
23. [Agent Guard (SDK + CLI)](#23-agent-guard-sdk--cli)

---

## 1. Proje Nedir?

BARET, Stellar transaction'larını **imzalanmadan önce** analiz eden bir güvenlik protokolüdür.

**3 cümlede:**
1. Bir Stellar işlemini (base64 XDR) alır, Horizon'dan hesap durumlarını çeker ve Soroban op'ları için preflight (simülasyon) çalıştırır — gerçekten göndermeden.
2. Sonucu bağımsız risk dedektörlerinden geçirir (kontrat reputation'ı, allowance/trustline değişimleri, kaynak ücretleri, auth ağacı derinliği, x402 kuralları…).
3. Kullanıcı policy'sine göre `safe: true/false` + gerekçe döner.

**Kim kullanır:** Stellar cüzdanları (kullanıcıyı imzadan önce uyarmak), dApp'ler, AI agent'lar (otomatik imza öncesi kontrol).

---

## 2. Monorepo & Genel Mimari

pnpm workspace. Tüm paketler `@stellar-thorn/*` adıyla.

```
apps/
  server/      Fastify + TypeScript analiz API'si (çekirdek)
  extension/   Chrome MV3 + Firefox eklentisi (Wallet Standard + x402)
  showcase/    Demo galerisi (6 tehdit senaryosu)
  wallet/      Bağımsız React Stellar akıllı cüzdanı
packages/
  swig-guard/         pre-sign guard SDK'sı (@stellar-thorn/swig-guard)
  baret-adapter/ dApp ↔ cüzdan postMessage köprüsü (@stellar-thorn/wallet-adapter)
  ext-protocol/       eklenti mesaj-yolu tipleri (@stellar-thorn/ext-protocol)
  showcase-ui/        showcase ortak UI iskeleti
  ui/                 tasarım token'ları + paylaşılan bileşenler
contracts/   Soroban kontratları (payment-guard, Rust)
```

**Teknoloji seçimleri:**
- **Fastify** — hızlı, TypeScript-dostu Node.js web framework'ü.
- **@stellar/stellar-sdk** — Horizon (`Horizon.Server`), Soroban RPC (`rpc.Server`), XDR, `TransactionBuilder`, `StrKey`.
- **Zod** — environment ve request şema doğrulaması.
- **@x402/core + @x402/stellar** — HTTP 402 ödeme akışı (Stellar exact scheme).

İstemci tarafı (cüzdan, eklenti, showcase) React + Vite; ortak görsel kimlik `@stellar-thorn/ui`.

---

## 3. Sunucu Başlatma Akışı

**`src/index.ts`**
```
1. loadConfig()      → environment okunur, Zod ile doğrulanır
2. buildApp(config)  → Fastify instance kurulur
3. app.listen(PORT)  → dinlemeye başlar
```

**`src/app.ts` — buildApp():**
1. Fastify instance (logger, body limit, request timeout, trust proxy)
2. Rate limiting (IP bazlı; `/health` muaf)
3. RPC adapter factory (Horizon + Soroban istemcileri)
4. Auth hook (`/v1/*` isteklerinde API key / x402 doğrulaması)
5. x402 etkinse ödeme katmanı
6. Route kaydı: health, analyze, batch/stream, replay, audit, mcp, demo-paywall

**Rate limiting:** IP bazlı, varsayılan 60 sn'de 200 istek; `DELTAG_RATE_LIMIT_MAX=0` ile kapatılır; `/health` muaf.

**Auth:** `/v1/*` isteklerinde `Authorization: Bearer <key>` ya da `x-api-key`; key `DELTAG_API_KEYS` listesinde yoksa 401. x402 modunda `/v1/analyze` ödeme ile erişilebilir (`DELTAG_AUTH_MODE`: `api_key` | `x402` | `both`).

---

## 4. Konfigürasyon Sistemi

**`src/config/index.ts`** — tüm ayarlar env'den gelir, Zod ile doğrulanır. Geçersiz/eksik değerde sunucu **hiç başlamaz**.

| Değişken | Varsayılan | Zorunlu | Açıklama |
|----------|-----------|---------|----------|
| `PORT` | 8080 | — | Dinleme portu |
| `NODE_ENV` | development | — | development/test/production |
| `LOG_LEVEL` | info | — | trace→fatal |
| `DELTAG_API_KEYS` | (boş) | — | Virgülle ayrılmış API key'leri |
| `DELTAG_AUTH_MODE` | api_key | — | api_key / x402 / both |
| `STELLAR_NETWORK` | testnet | — | `testnet` veya `pubnet` |
| `STELLAR_HORIZON_URL` | — | **Evet** | Horizon endpoint'i |
| `STELLAR_SOROBAN_RPC_URL` | — | **Evet** | Soroban RPC endpoint'i |
| `STELLAR_USDC_ISSUER` | ağ varsayılanı | — | Klasik USDC issuer'ı (G…) |
| `STELLAR_USDC_CODE` | USDC | — | Klasik USDC asset kodu |
| `RISKY_CONTRACT_IDS` | (boş) | — | Tehlikeli kontrat id'leri (C…), virgülle |
| `KNOWN_SAFE_CONTRACT_IDS` | (boş) | — | Güvenli allowlist; doluysa diğerleri "unknown exposure" |
| `MAX_SIMULATION_OPERATIONS` | 20 | — | Ön-duruma alınacak max hesap (1–100) |
| `MAX_BODY_BYTES` | 1MB | — | Max istek gövdesi |
| `REQUEST_TIMEOUT_MS` | 25000 | — | RPC zaman aşımı |
| `DELTAG_RATE_LIMIT_MAX` / `_WINDOW_MS` | 200 / 60000 | — | Rate limit |
| `DELTAG_TRUST_PROXY` | — | — | Reverse proxy arkası gerçek IP |
| `X402_ENABLED` | — | — | x402 ödeme kapısı |
| `X402_PAY_TO` | — | x402'de evet | Alıcı Stellar adresi (G…) |
| `X402_NETWORK` | `stellar:<network>` | — | CAIP-2 ağ kimliği |
| `X402_FACILITATOR_URL` | x402.org/facilitator | — | Facilitator endpoint'i |
| `X402_ANALYZE_PRICE` | $0.001 | — | İstek başı fiyat |

USDC, ağ başına varsayılan Circle issuer'ı (klasik `G…`) ve Soroban SAC kontratı (`C…`) ile gelir.

---

## 5. Bir İsteğin Hayat Döngüsü

`POST /v1/analyze` gövdesi: `{ transactionXdr, network?, policy?, userWallet?, integratorRequestId?, paymentRequirements? }`.

```
İSTEK
  │
  ▼
[1] Rate limit (IP)
[2] Auth (API key veya x402 ödeme)
[3] Zod gövde doğrulama (transactionXdr zorunlu; userWallet geçerli G… olmalı)
  │
  ▼  src/application/analyze-transaction.ts
[4]  decodeStellarTransactionXdr()      XDR → Transaction; iç tx açılır
[5]  collectTxAccounts()                hesaplar (G…), kontratlar (C…), varlıklar
[6]  pickAccountsForSimulation()        MAX_SIMULATION_OPERATIONS'a göre kırp
[7]  StellarSimulator.simulate()        Horizon pre-state + Soroban preflight
[8]  extractEstimatedChanges()          native/asset/trustline/allowance delta
[9]  parseSorobanAuthTree()             Soroban auth entry ağacı
[10] decodeTransactionOperations()      insan-okunur op özeti
[11] runRiskDetection()                 tüm dedektörler
[12] evaluatePolicy()                   policy gate'leri + ek policy bulguları
[13] generateSuggestions()              iyileştirme önerileri
[14] audit.record()                     in-memory kayıt
  │
  ▼
YANIT  { safe, reasons, estimatedChanges, riskFindings, simulationWarnings, meta, suggestions }
```

---

## 6. Transaction Decode (XDR)

**`src/simulation/tx-decode.ts`** — `decodeStellarTransactionXdr(xdr, networkPassphrase)`:
- Base64 `TransactionEnvelope` XDR'ı `@stellar/stellar-sdk` `TransactionBuilder.fromXDR()` ile çözer.
- `FeeBumpTransaction` ise iç işlem `unwrapInnerTransaction()` ile açılır.
- Çıktı: imzalanabilir/incelenebilir `Transaction` nesnesi.

> Stellar işlemi tüm hesap referanslarını XDR içinde açıkça taşır; ayrı bir adres-tablosu çözümleme adımı gerekmez.

**`src/simulation/account-keys.ts`** — `collectTxAccounts(tx)` op'ları gezerek dokunulan klasik hesapları (G…), Soroban kontratlarını (C…) ve varlıkları toplar.

---

## 7. Hesap Toplama & Simülasyon

**`src/simulation/stellar-simulator.ts`** — `StellarSimulator.simulate({ network, tx, accountIdsForPreState })`:

1. **Horizon pre-state:** ilgili hesapların mevcut durumu (`loadAccount`) **paralel** çekilir; `accountStateFromHorizon()` ile SDK-bağımsız wire-shape'e (`SimulationAccountState`: bakiye, trustline'lar, signer'lar, eşikler) çevrilir. 404 → "henüz fonlanmamış" stub.
2. **Soroban preflight:** işlemde Soroban op'u (`invokeHostFunction`) varsa Soroban RPC `simulateTransaction` çalıştırılır → min kaynak ücreti, diagnostic event'ler, auth entry'leri.
3. **Normalize:** `buildNormalizedSimulation()` her ikisini birleştirip kanonik `NormalizedSimulation` üretir:
   - `status`: `success` | `failed`
   - `preflighted`: Soroban preflight gerçekten çalıştı mı (sadece-classic tx'lerde false)
   - `accounts`, `events`, `feeStroops`, `minResourceFeeStroops`, `authEntries`, `hostFnResultsXdr`

Preflight "restore gerekiyor" dönerse non-fatal `failed` olarak işaretlenir (detektörler işaretler ama analiz devam eder).

---

## 8. Tahmini Değişimler (Delta Extraction)

**`src/analysis/extract-deltas.ts`** — `extractEstimatedChanges(preMap, simulation, tx, userWallet)` simülasyon öncesi/sonrası farkından `EstimatedChanges` üretir:

- **native:** hesap başına XLM değişimi — `preStroops / postStroops / deltaStroops` (string; tam hassasiyet için stroop cinsinden, 1 XLM = 10.000.000 stroop).
- **assets:** klasik trustline + Soroban token bakiye değişimleri (`asset` = `CODE:ISSUER` veya `C…`, `delta`, `decimals`).
- **trustlines:** `changeTrust` op'larından doğan trustline değişimleri (`direction`: added/removed/increased/decreased, `newLimit`).
- **allowances:** Soroban `approve` host-fn'lerinden allowance grant'leri (`tokenAddress`, `spender`, `amount`, `expirationLedger`).

> Tutarlar **stroop** cinsindedir (1 XLM = 10.000.000 stroop); varlık değişimleri **trustline / Soroban token** bakiyeleri, yetki verme ise **Soroban allowance** olarak modellenir.

---

## 9. Soroban Auth Ağacı & Operasyon Decode

**`src/simulation/cpi-parser.ts`** — `parseSorobanAuthTree(tx)`: Soroban authorization tree'sini çıkarır (hangi auth entry hangi kontratın hangi fonksiyonuna yetki veriyor, iç içe çağrı derinliği). Derin/yoğun çağrı ağaçları risk dedektörlerine girdi olur.

**`src/analysis/instruction-decoder.ts`** — `decodeTransactionOperations(tx)`: op'ları insan-okunur özete çevirir (`payment`, `changeTrust`, `setOptions`, `accountMerge`, `invokeHostFunction` → `soroban_transfer`/`soroban_approve`…). Bu özet hem audit hem öneri motoru için kullanılır.

---

## 10. Risk Tespit Sistemi

**`src/risk/index.ts` — `runRiskDetection(args)`** tüm dedektörleri sırayla çağırır, bulguları birleştirir. Dedektörler `src/risk/detectors/` altında bağımsızdır:

| Dosya | Fonksiyon | Tespit | Bulgu kodları |
|-------|-----------|--------|----------------|
| `simulation.ts` | `detectSimulationFindings` | Preflight başarısız; sadece-classic (preflight yok) | `SIMULATION_FAILED`, `LOW_CONFIDENCE_INCOMPLETE_DATA` |
| `programs.ts` | `detectContractFindings` | Risky listedeki kontrat; known-safe dışı kontrat | `RISKY_CONTRACT_INTERACTION`, `UNKNOWN_CONTRACT_EXPOSURE` |
| `reputation.ts` | `detectReputationFindings` | Reputation DB'deki adres/kontrat | `KNOWN_MALICIOUS_ADDRESS` |
| `deltas.ts` | `detectAllowanceAndTrustlineFindings` | Trustline değişim/kaldırma; Soroban allowance; sınırsızlık | `TRUSTLINE_CHANGE_DETECTED`, `TRUSTLINE_REMOVED`, `UNLIMITED_TRUSTLINE`, `SOROBAN_ALLOWANCE_GRANTED`, `SOROBAN_ALLOWANCE_UNLIMITED` |
| `deltas.ts` | `detectIncompleteDataFinding` | Kırpılmış hesaplar / eksik userWallet | `LOW_CONFIDENCE_INCOMPLETE_DATA` |
| `cpi.ts` | `detectCpiFindings` | Auth ağacı derinliği ≥5; invocation ≥20 | `DEEP_SUB_INVOCATION_NESTING`, `HIGH_OPERATION_COUNT` |
| `compute.ts` | `detectResourceFindings` | Soroban min kaynak ücreti / base fee eşik aşımı | `EXCESSIVE_RESOURCE_FEE`, `EXCESSIVE_BASE_FEE` |
| `x402.ts` | `detectX402Findings` | Memo eksik; allowlist dışı varlık; hedef/varlık uyuşmazlığı | `X402_MEMO_MISSING`, `X402_NON_CANONICAL_ASSET`, `X402_DESTINATION_MISMATCH`, `X402_ASSET_MISMATCH` |

Her bulgu: `{ code, severity (low/medium/high/critical), message, details? }`.

> Risk modeli tümüyle Stellar-yereldir: kontrat id'leri (`C…`), Soroban authorization tree, kaynak/base ücretleri, klasik trustline'lar ve Soroban allowance'ları üzerinden çalışır.

---

## 11. Policy Motoru

**`src/policy/engine.ts` — `evaluatePolicy(input)`** bulguları + kullanıcı policy'sini değerlendirir ve `Decision` döner. Policy basit bir nesnedir (`src/domain/policy.ts`):

**Pre-sign kuralları:** `requireSuccessfulSimulation` (varsayılan açık), `blockRiskyContracts`, `blockUnknownContractExposure`, `blockSorobanAllowanceGrants`, `blockTrustlineChanges`, `blockUnlimitedTrustlines`, `blockAccountMerge`, `blockSignerChanges`, `blockMasterKeyRemoval`, `allowWarnings`, `maxLossPercent`, `minPostUsdcBalance` + `minPostAsset`.

**x402 kuralları:** `requireMemo`, `maxResourceFeeStroops`, `maxBaseFeeStroops`, `allowedAssets`.

Motor ek policy bulguları üretebilir: `ESTIMATED_LOSS_EXCEEDS_MAX`, `POST_BALANCE_TOO_LOW`, `LOSS_PERCENT_UNAVAILABLE`. Karar mantığı `isBlocked()` içinde **fail-closed**'dur: yeterli veri yoksa (ör. loss hesaplanamıyor) blok tarafına düşer. `Decision.meta` network, `simulatedAt`, `confidence` (low/medium/high) taşır.

**İkincil DSL:** `src/policy/dsl.ts` — MCP profilleri için kural-tabanlı bir DSL vardır (operatörler: `eq/neq/gt/lt/gte/lte/in/not_in/contains/exists`; aksiyonlar: `allow/block/warn`; hazır profiller: `strict`, `defi-permissive`, `monitor-only`). Ana analiz yolu yukarıdaki nesne-policy'sini kullanır; DSL gelişmiş/opsiyoneldir.

**swig-guard şablonları (istemci tarafı):** STRICT / BALANCED / PERMISSIVE (bkz. §17).

---

## 12. Öneri Motoru

**`src/analysis/suggestion-engine.ts` — `generateSuggestions(tx, decision, simulation, txSummary)`**: karar + op özetinden eyleme dönük öneriler üretir (ör. sınırsız allowance yerine sınırlı miktar, riskli kontrattan kaçınma, yüksek ücret uyarısı). Öneriler yanıtın `suggestions` alanında döner; bloklama yapmaz, yalnızca yol gösterir.

---

## 13. Audit Trail & Reputation

**Audit — `src/data/audit-store.ts`:** her analiz sonucu kaydedilir: `{ id, timestamp, network, safe, confidence, riskCodes, contractAddresses, primaryAction, userWallet?, integratorRequestId?, durationMs }`. Son **10.000** kayıt **bellekte** tutulur (kalıcı DB yok; restart'ta sıfırlanır). Kontrat bazlı istatistikler (totalSeen, blockedCount, riskCodes, lastSeen) ve agregat görünüm (top risk kodları, top bloklanan kontratlar) sunulur. Endpoint'ler: `/v1/audit/recent`, `/v1/audit/aggregate`, `/v1/audit/contract/:address`.

**Reputation — `src/risk/detectors/reputation.ts` + seed verisi:** bilinen kötü adres/kontrat (drainer, phishing) listesi. İşlemdeki herhangi bir adres listede varsa `KNOWN_MALICIOUS_ADDRESS` üretilir. Şu an seed verisiyle başlar; genişletilebilir.

---

## 14. Batch, Streaming, Replay

- **Batch — `src/api/routes/batch.ts`:** `POST /v1/analyze/batch` en fazla 25 işlemi tek istekte analiz eder.
- **Streaming (SSE):** `POST /v1/analyze/stream` sonuçları Server-Sent Events olarak akıtır (her işlem bittikçe yayınlanır).
- **Replay — `src/api/routes/replay.ts`:** `POST /v1/replay` aynı işlemi yeniden simüle eder; `ledger` parametresi bilgilendiricidir.

---

## 15. MCP Server

**`src/mcp/server.ts` + `src/api/routes/mcp.ts`** — Model Context Protocol; AI agent'ları araç olarak çağırır.

- `GET /mcp/tools` — araç tanımlarını listeler
- `POST /mcp/call` — araç çağırır

Araçlar: `baret_analyze` (işlem analiz), `baret_health` (servis durumu), `baret_list_profiles` (policy DSL profilleri).

---

## 16. x402 Ödeme Sistemi

HTTP 402 "Payment Required" üzerine kurulu mikro-ödeme. Stellar **exact scheme** (`@x402/stellar`).

**`src/infra/x402.ts` + `src/x402/facilitator-client.ts`:**
1. Ödemesiz istek → sunucu **402 + PaymentRequirements** döner.
2. İstemci Stellar USDC ödemesi yapar (klasik asset ya da Soroban SAC).
3. `preHandler`: `PAYMENT-SIGNATURE` header'ı facilitator'a (`X402_FACILITATOR_URL`) doğrulatılır.
4. Analiz başarılıysa `settleAfterSuccess` ile ödeme kesinleştirilir (settlement).

Ağ kimliği `stellar:testnet` / `stellar:pubnet`. Alıcı `X402_PAY_TO` (Stellar `G…` adresi). Demo: **`GET /demo/scrybe?q=…`** (`src/api/routes/demo-paywall.ts`) — showcase'in Scrybe sitesini besler.

---

## 17. swig-guard SDK

**`packages/swig-guard`** — cüzdan/dApp'lerin imzadan önce işlem değerlendirmesi için kullandığı SDK. SDK-free tutulur (Stellar SDK'sı import etmeden tüketilebilir).

- **`TransactionGuard`** — `new TransactionGuard({ analyze: { baseUrl, apiKey }, network })`.
  - `evaluate({ transactionXdr, userWallet, policy, integratorRequestId? })` → `{ decision, advisoryFindings, blockingReasons, analysis, transactionXdr }`. **Asla imzalamaz/göndermez**; sadece karar döner.
  - `prepare(...)` — blokta `GuardBlockedError` fırlatır (exception-flow için).
- **`analyzeTransaction(cfg, req)`** — `/v1/analyze`'a HTTP istemcisi.
- **Tipler** — `AnalysisResult` (`safe`, `reasons`, `estimatedChanges`, `riskFindings`), `RiskFinding`, `RiskSeverity`, `StellarNetwork = "testnet" | "pubnet"`.
- **Policy** — `GuardPolicy` + şablonlar `STRICT_POLICY` / `BALANCED_POLICY` / `PERMISSIVE_POLICY` ve `POLICY_TEMPLATES`. `validatePolicy()` / `normalizePolicy()`.

İşlem XDR'ını **çağıran taraf kurar** (Stellar smart-wallet sarmalama yöntemleri deployment'a göre değişir); guard'ın işi analiz + policy uygulamaktır.

---

## 18. Wallet Adapter & Browser Extension

**`packages/baret-adapter` (@stellar-thorn/wallet-adapter):** dApp ↔ BARET cüzdanı arası `postMessage` köprüsü. Protokol mesajları (`src/protocol.ts`) `__bt: "1"` ile etiketlenir: `connect-request/approved/rejected`, `sign-request` (`transactionXdr`, mode: `sign | signAndSend`), `sign-approved` (`signedTransactionXdr`, opsiyonel `signature`), `sign-rejected`. dApp'in imzalattığı her işlem cüzdanın policy gate'inden geçer.

**`apps/extension`:** Chrome MV3 + Firefox. Stellar **Wallet Standard** sağlayıcısı + **x402 interceptor**.
- **background:** hesap durum makinesi, IndexedDB (keystore, history, allowances, site izinleri), zincir monitörü, kripto oturumu (PBKDF2 + AES-GCM), Soroban sub-key imzalama.
- **popup:** 360×600 araç çubuğu (Home/Activity/Allowances/Settings).
- **options:** tam cüzdan arayüzü (onboarding, policies, sites, x402).
- **inpage:** `window.stellar` Wallet Standard API'si + HTTP 402 yanıtlarını yakalayıp USDC ödemesi kuran x402 interceptor.
- Bağlantı/RPC: Horizon + Soroban (`src/background/rpc/connection.ts`), ağ `testnet`/`pubnet`.

---

## 19. Bağımsız Cüzdan (apps/wallet)

Port 5180'de çalışan bağımsız React Stellar akıllı cüzdanı (eklentinin daha sade, demo muadili). `@stellar/stellar-sdk` ile çalışır; swig-guard ile pre-sign analiz, wallet-adapter ile dApp bağlantısı yapar.

- **Çekirdek:** `wallet/connection.ts` (Horizon + Soroban + Friendbot + stellar.expert explorer), `wallet/keypair.ts` (Stellar `Keypair`), `wallet/smart-wallet.ts` (provizyon — şimdilik authority adresini placeholder smart-wallet olarak kullanır), `wallet/stellar-tx.ts` (XLM payment XDR kur → imzala → Horizon'a gönder), `wallet/state.tsx` (identity/bakiye/fund/provision).
- **Akış:** Onboarding'de Stellar keypair üretilir, Friendbot ile testnet XLM fonlanır; Send/Sign işlemi XDR olarak kurulup `guard.evaluate()`'e gönderilir, "allow" ise imzalanıp gönderilir.
- **Sayfalar:** onboarding, home, send, receive, history, policies, settings, connect, sign.

> Gerçek Soroban smart-wallet kontrat entegrasyonu işaretli TODO'dur; şu an `smartWalletAddress = authority adresi`.

---

## 20. API Endpoint'leri

| Yöntem | Adres | Açıklama |
|--------|-------|----------|
| GET | `/health` | Basit sağlık (rate-limit muaf) |
| GET | `/health/ready` | Horizon + (varsa) x402 facilitator hazır mı |
| POST | `/v1/analyze` | Tek işlem analizi |
| POST | `/v1/analyze/batch` | Toplu analiz (≤25) |
| POST | `/v1/analyze/stream` | SSE sonuç akışı |
| POST | `/v1/replay` | Simülasyonu yeniden çalıştır |
| GET | `/v1/audit/recent` | Son kayıtlar (≤200) |
| GET | `/v1/audit/aggregate` | Agregat istatistikler |
| GET | `/v1/audit/contract/:address` | Kontrat bazlı audit |
| GET | `/mcp/tools` | MCP araç listesi |
| POST | `/mcp/call` | MCP araç çağrısı |
| GET | `/demo/scrybe` | x402 demo paywall |

---

## 21. Veri Modelleri

**`src/domain/`** (ve `packages/swig-guard/src/types.ts` aynalanır):

- **`NormalizedSimulation`** (`simulation-normalized.ts`): `status`, `err`, `events`, `accounts: SimulationAccountState[]`, `feeStroops`, `authEntries`, `hostFnResultsXdr`, `preflighted`, `minResourceFeeStroops`.
- **`SimulationAccountState`**: `accountId`, `exists`, `nativeBalance`, `balances: AssetBalance[]`, `sequence`, `signers`, `thresholds`.
- **`EstimatedChanges`** (`estimated-changes.ts`): `native: NativeBalanceChange[]`, `assets: AssetBalanceChange[]`, `trustlines: TrustlineChange[]`, `allowances: SorobanAllowanceChange[]`.
- **`RiskFinding`** (`findings.ts`): `code: RiskFindingCode`, `severity`, `message`, `details?`.
- **`Policy`** (`policy.ts`): §11'deki alanlar.
- **`Decision`** (`decision.ts`): `safe`, `reasons`, `estimatedChanges`, `riskFindings`, `simulationWarnings`, `meta: { analysisVersion, network, simulatedAt, confidence }`.

Tüm tutarlar **stroop** (string, tam hassasiyet; 1 XLM = 10.000.000 stroop).

---

## 22. Dosya Haritası

```
apps/server/src/
├── index.ts                      Giriş noktası
├── app.ts                        Fastify kurulumu, route kaydı
├── config/index.ts               Env şeması + loadConfig()
├── application/
│   └── analyze-transaction.ts    Ana analiz orkestratörü
├── simulation/
│   ├── tx-decode.ts              XDR decode + iç tx açma
│   ├── account-keys.ts           Hesap/kontrat/varlık toplama
│   ├── stellar-simulator.ts      Horizon pre-state + Soroban preflight
│   ├── normalize-simulation.ts   NormalizedSimulation üretimi
│   ├── cpi-parser.ts             Soroban auth ağacı
│   └── replay.ts                 Replay yardımcıları
├── analysis/
│   ├── extract-deltas.ts         EstimatedChanges (delta extraction)
│   ├── instruction-decoder.ts    Operasyon → insan-okunur özet
│   └── suggestion-engine.ts      Öneri üretimi
├── risk/
│   ├── index.ts                  runRiskDetection()
│   └── detectors/                simulation, programs, reputation,
│                                 deltas, cpi, compute, x402
├── policy/
│   ├── engine.ts                 evaluatePolicy()
│   └── dsl.ts                    İkincil kural DSL'i + profiller
├── domain/                       policy, decision, findings,
│                                 estimated-changes, simulation-normalized
├── data/audit-store.ts           In-memory audit trail
├── infra/
│   ├── stellar-rpc.ts            Horizon + Soroban RPC adapteri
│   └── x402.ts                   x402 katmanı
├── x402/facilitator-client.ts    Facilitator HTTP istemcisi
├── mcp/server.ts                 MCP araçları
└── api/routes/                   health, analyze, batch, replay,
                                  audit, mcp, demo-paywall

packages/
├── swig-guard/      guard SDK (TransactionGuard, analyzeTransaction, policy)
├── agent-guard/     agent/program-wallet SDK + `baret` CLI (§23)
├── baret-adapter/  dApp ↔ cüzdan postMessage protokolü
├── ext-protocol/    eklenti mesaj tipleri
├── showcase-ui/     showcase UI iskeleti
└── ui/              tasarım token'ları + bileşenler

apps/{extension,wallet,showcase}/  React UI'ları (§18, §19); showcase /agents kontrol sayfası (§23)
contracts/payment-guard/           Soroban payment-guard kontratı (Rust)
```

---

## 23. Agent Guard (SDK + CLI)

**`packages/agent-guard` (@stellar-thorn/agent-guard)** — swig-guard'ın "batteries-included"
üst katmanı: aynı pre-sign korumasını **otonom agent'lar ve program (bot) cüzdanları** için
sunar. swig-guard SDK-free kalır; anahtar tutma + imzalama + Horizon'a gönderme bu paketin işidir
(`@stellar/stellar-sdk` doğrudan bağımlılık). NodeNext build → CLI doğrudan node ile çalışır.

- **`src/agent.ts` — `AgentWallet`**: çekirdek sınıf. `fromSecret(secret, cfg)` / `random(cfg)`.
  - `evaluate(xdr)` → `TransactionGuard.evaluate` sarmalar (userWallet = agent adresi). **İmzalamaz.**
  - `guardedSign(xdr)` → policy izin verirse `Keypair` ile imzalar; blokta `GuardBlockedError`. Secret gerekir.
  - `guardedSubmit(xdr)` → guardedSign → Horizon `submitTransaction` → `{ hash, explorerUrl }`. Secret gerekir.
  - **Fail-closed**: server erişilemezse `AnalyzeError` fırlar, imzalanmaz (`allowOffline` bilinçli istisna).
- **`src/config.ts`**: katmanlı config çözümü (açık opsiyon → env `BARET_*` → `~/.baret/config.json` → varsayılan).
  Agent secret'ı **asla dosyaya yazılmaz**; yalnız `BARET_AGENT_SECRET`/opsiyondan okunur.
  `loadConfig`, `resolvePolicy` (swig-guard `POLICY_TEMPLATES`), `resolveHorizonUrl`.
- **`src/cli.ts` — `baret`**: `node:util parseArgs` tabanlı (ek bağımlılık yok). Komutlar:
  `analyze | sign | submit | address | init | policy list`. `<xdr>` `-` ise stdin. `--json` makine çıktısı.
  **Exit kodları:** `0` allow/başarı, `1` policy bloğu, `2` hata — her dilden script'lenebilir.

**Kontrol sayfası — `apps/showcase/src/pages/AgentsPage.tsx` (route `/agents`):** ne olduğunu basitçe
anlatır, kopyalanabilir kurulum/SDK/CLI snippet'leri, policy seçici (Strict/Balanced/Permissive),
**canlı playground** (gerçek `/v1/analyze`, mevcut `baret/analyze.ts` üzerinden) ve agent adresine göre
filtreli **canlı izleme** (`/v1/audit/recent`). Nav linki paylaşılan `LandingChrome` `NAV_LINKS`'e eklidir.

---

> Bu doküman mevcut Stellar implementasyonunu yansıtır. Tek otorite kaynak koddur; bir uyuşmazlık görürsen koda güven ve bu dokümanı güncelle.
