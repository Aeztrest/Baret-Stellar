# BLACKTHORN — Proje Özeti

Bu doküman projedeki her şeyi sade bir dille anlatır. Kod bilmek gerekmez.

---

## Tek Cümlede Ne Bu?

Stellar'da bir işlem imzalanmadan önce onu simüle edip "bu güvenli mi yoksa tehlikeli mi?" sorusuna gerekçeli cevap veren bir güvenlik altyapısı.

---

## Problem Ne?

Stellar'da bir kullanıcı bir dApp'e girip "Onayla"ya bastığında:

- Arka planda ne olduğunu göremez
- Hangi Soroban kontratlarının çağrıldığını bilmez
- Token'ları için birine harcama yetkisi (allowance) verilip verilmediğini anlamaz
- Bir trustline'ın değiştirildiğini, hesabının merge edildiğini ya da imza yetkilerinin elinden alındığını fark etmez

Sonuç: wallet drainer, rug pull ve phishing saldırıları insanları mağdur ediyor.

---

## Çözüm Nasıl Çalışıyor?

```
Kullanıcı imzalamak üzere  →  Blackthorn devreye girer
                               ↓
              İşlemi Soroban preflight + Horizon ile simüle eder
                       (gerçekten göndermeden)
                               ↓
                  Bağımsız risk dedektörlerini çalıştırır
                               ↓
                   Policy kurallarını değerlendirir
                               ↓
              "safe: true/false" + gerekçeler + bakiye değişimleri
```

Her şey imza atılmadan önce olur. Tehlikeli çıkarsa işlem wallet seviyesinde bloklanır — dApp'in insafına kalmaz.

---

## Proje Yapısı — Ne Var?

Monorepo (pnpm workspace). Tüm paket adları `@stellar-thorn/*`.

```
BaretStellar/
├── apps/
│   ├── server/      ← Ana analiz API motoru (Fastify + TypeScript). Her şeyin kalbi.
│   ├── extension/   ← Chrome MV3 + Firefox tarayıcı eklentisi (akıllı cüzdan + dApp koruması).
│   ├── showcase/    ← Demo galerisi — gerçek tehdit senaryolarını canlandıran sahte siteler.
│   └── wallet/      ← Bağımsız React akıllı cüzdan demosu (Baret policy ile korumalı).
│
├── packages/
│   ├── swig-guard/         ← Cüzdan/dApp geliştiricileri için pre-sign guard SDK'sı (@stellar-thorn/swig-guard).
│   ├── blackthorn-adapter/ ← dApp ↔ cüzdan postMessage köprüsü (@stellar-thorn/wallet-adapter).
│   ├── ext-protocol/       ← Eklenti mesaj-yolu tipleri ve yardımcıları.
│   ├── showcase-ui/         ← Showcase siteleri için ortak UI iskeleti (navbar, footer, connect modal).
│   └── ui/                  ← Tasarım token'ları + paylaşılan React bileşenleri (görsel kimlik kaynağı).
│
├── contracts/       ← Soroban kontratları (payment-guard, Rust).
├── docker-compose.yml · render.yaml · vercel.json
└── pnpm-workspace.yaml
```

**Teknoloji:** Fastify (API), `@stellar/stellar-sdk` (Horizon + Soroban), Zod (doğrulama), React + Vite (cüzdan/showcase/eklenti UI'ları), `@x402/stellar` (ödeme).

---

## Ana Motor — Bir İşlemin Yolculuğu

`POST /v1/analyze` isteği `transactionXdr` (base64 Stellar `TransactionEnvelope`) aldığında:

1. **Decode:** `decodeStellarTransactionXdr()` — XDR çözülür, iç işlem (`unwrapInnerTransaction`) açılır.
2. **Hesap toplama:** `collectTxAccounts()` — işlemin dokunduğu hesaplar (G…), kontratlar (C…) ve varlıklar bulunur.
3. **Simülasyon:** `StellarSimulator.simulate()` —
   - Horizon'dan tüm hesapların **mevcut durumu** (bakiye, signer'lar, trustline'lar) paralel çekilir
   - Soroban op'ları varsa **preflight** (`simulateTransaction`) çalıştırılır → kaynak ücreti + diagnostic event'ler
4. **Bakiye değişimi:** `extractEstimatedChanges()` — simülasyon öncesi/sonrası karşılaştırılarak native XLM, varlık, trustline ve Soroban allowance değişimleri çıkarılır.
5. **Soroban auth ağacı:** `parseSorobanAuthTree()` — hangi auth entry hangi kontrata yetki veriyor.
6. **İşlem özeti:** `decodeTransactionOperations()` — op'lar insan diline çevrilir ("payment", "changeTrust", "invokeHostFunction"…).
7. **Risk dedektörleri:** `runRiskDetection()` — tüm dedektörler sırayla çalışır.
8. **Policy kararı:** `evaluatePolicy()` — bulgular + kullanıcı policy'si değerlendirilir, ek policy bulguları üretilir.
9. **Öneriler:** `generateSuggestions()` — varsa "şöyle yapsan daha güvenli" notları.
10. **Audit:** sonuç in-memory audit kaydına yazılır.
11. **Yanıt:** `safe: true/false` + gerekçeler + bulgular + tahmini bakiye değişimleri + meta (network, confidence).

---

## Risk Dedektörleri

`apps/server/src/risk/detectors/` — her biri bağımsız çalışır, kendi bulgularını üretir.

| Dedektör | Ne yakalar | Örnek bulgu kodları |
|----------|-----------|----------------------|
| **simulation** | Soroban preflight başarısız mı; sadece-classic tx (preflight yok) | `SIMULATION_FAILED`, `LOW_CONFIDENCE_INCOMPLETE_DATA` |
| **programs (contracts)** | Tehlikeli listedeki kontrat; bilinen-güvenli listede olmayan kontrat | `RISKY_CONTRACT_INTERACTION`, `UNKNOWN_CONTRACT_EXPOSURE` |
| **reputation** | İşlemdeki adres/kontrat reputation veritabanında işaretli mi | `KNOWN_MALICIOUS_ADDRESS` |
| **deltas** | Trustline açma/kaldırma; Soroban allowance grant; sınırsız allowance/trustline | `TRUSTLINE_CHANGE_DETECTED`, `TRUSTLINE_REMOVED`, `SOROBAN_ALLOWANCE_GRANTED`, `SOROBAN_ALLOWANCE_UNLIMITED`, `UNLIMITED_TRUSTLINE` |
| **cpi** | Soroban auth ağacı çok derin (≥5) ya da çok fazla invocation (≥20) | `DEEP_SUB_INVOCATION_NESTING`, `HIGH_OPERATION_COUNT` |
| **compute** | Soroban min kaynak ücreti ya da base fee policy eşiğini aşıyor | `EXCESSIVE_RESOURCE_FEE`, `EXCESSIVE_BASE_FEE` |
| **x402** | Ödeme tx'inde memo eksik; varlık allowlist dışı; hedef/varlık uyuşmazlığı | `X402_MEMO_MISSING`, `X402_NON_CANONICAL_ASSET`, `X402_DESTINATION_MISMATCH`, `X402_ASSET_MISMATCH` |

Ek olarak **policy motoru** kendi bulgularını üretir: `ESTIMATED_LOSS_EXCEEDS_MAX`, `POST_BALANCE_TOO_LOW`, `LOSS_PERCENT_UNAVAILABLE`.

---

## Policy Motoru — Karar Nasıl Verilir?

Bulgular toplandıktan sonra policy motoru karar verir. Policy basit bir nesnedir (boolean/number alanlar):

| Kural | Ne yapar |
|-------|----------|
| `requireSuccessfulSimulation` | Soroban preflight başarısızsa blokla (varsayılan: açık) |
| `blockRiskyContracts` | Tehlikeli listedeki kontrata dokunuluyorsa blokla |
| `blockUnknownContractExposure` | Bilinen-güvenli listede olmayan kontrat varsa blokla |
| `blockSorobanAllowanceGrants` | Soroban `approve` (allowance) varsa blokla |
| `blockTrustlineChanges` / `blockUnlimitedTrustlines` | Trustline değişimi / sınırsız trustline'ı blokla |
| `blockAccountMerge` | `accountMerge` op'unu blokla (native drain primitifi) |
| `blockSignerChanges` / `blockMasterKeyRemoval` | İmza seti / eşik değişimini, master-key kaldırmayı blokla |
| `maxLossPercent` | Tahmini XLM kaybı bu yüzdeyi aşarsa blokla |
| `minPostUsdcBalance` / `minPostAsset` | İşlem sonrası varlık bakiyesi minimumun altına düşerse blokla |
| `allowWarnings` | Açıksa orta-seviye uyarılar tek başına bloklamaz |
| x402: `requireMemo`, `maxResourceFeeStroops`, `maxBaseFeeStroops`, `allowedAssets` | Ödeme tx'i kuralları |

### Hazır şablonlar (swig-guard)

- **Strict (Katı):** her şüpheli aktiviteyi blokla, dar x402 caps.
- **Balanced (Dengeli):** üretim varsayılanı — drain'leri ve yetkisiz allowance'ları blokla, bilinmeyen kontratlara izin ver.
- **Permissive (Esnek):** sadece ölümcül sonuçları blokla.

> Not: Sunucuda ayrıca MCP profilleri için ikincil bir kural DSL'i (`strict` / `defi-permissive` / `monitor-only`, operatörler: eq/neq/gt/lt/in/contains/exists) vardır; ana analiz yolu yukarıdaki nesne-policy'sini kullanır.

---

## Showcase — Demo Senaryolar

`apps/showcase/src/sites/` — her biri gerçek bir Stellar tehdit senaryosunu canlandıran sahte bir site. Her sitenin "safe" ve "danger" varyantı var.

| Site | Senaryo | Blackthorn ne yakalar |
|------|---------|------------------------|
| **novaswap** | Token swap (XLM → USDC) | Drainer pattern, kötü swap rotası |
| **pixeldrop** | NFT mint | Drainer / honeypot mint |
| **orbityield** | Staking / yield | Doğrulanmamış havuz (warn) |
| **claimhub** | Airdrop claim | Phishing + sınırsız token allowance |
| **launchpad** | Token satışı | Rug-pull launchpad |
| **scrybe** | Soru-başına oracle | x402 ödeme akışı (HTTP 402 → USDC imzası → on-chain kanıt) — Baret her ödemeyi analiz eder |

---

## Browser Extension (Chrome / Firefox)

`apps/extension/` — Chrome MV3 + Firefox. Stellar **Wallet Standard** sağlayıcısı + **x402 interceptor** olarak çalışır.

- **background:** hesap durumu, IndexedDB kalıcılığı, zincir monitörü
- **popup:** 360×600 araç çubuğu (bakiye, hızlı işlemler, Activity / Allowances / Settings sekmeleri)
- **options:** tam cüzdan arayüzü
- **inpage:** `window.stellar` Wallet Standard API'si + HTTP 402 yanıtlarını yakalayıp USDC ödemesi kuran x402 interceptor

Her imza talebi swig-guard üzerinden Blackthorn analizine girer; riskli işlemler dApp'te değil, cüzdanda bloklanır.

---

## Wallet (Bağımsız Demo Cüzdan)

`apps/wallet/` — port 5180'de çalışan bağımsız React Stellar akıllı cüzdanı. `@stellar/stellar-sdk` kullanır, swig-guard ile pre-sign analiz, wallet-adapter ile dApp bağlantısı yapar.

Sayfalar: `onboarding`, `home`, `send`, `receive`, `history`, `policies`, `settings`, `connect`, `sign`. Testnet'te Friendbot ile fonlanır; akıllı cüzdan adresi şimdilik authority adresinin placeholder'ıdır (Soroban kontrat entegrasyonu işaretli TODO).

---

## swig-guard — Geliştirici SDK'sı

`packages/swig-guard` — cüzdan/dApp geliştiricilerinin imzadan önce işlem değerlendirmesi için kullandığı paket.

- **`TransactionGuard`** — `evaluate({ transactionXdr, userWallet, policy })` → `{ decision, blockingReasons, analysis, transactionXdr }`. `prepare()` blokta `GuardBlockedError` fırlatır.
- **`analyzeTransaction(cfg, req)`** — Blackthorn `/v1/analyze`'a HTTP istemcisi.
- **`AnalysisResult`** — `safe`, `reasons`, `estimatedChanges` (native/assets/trustlines/allowances), `riskFindings`.
- **`GuardPolicy` + şablonlar** (STRICT / BALANCED / PERMISSIVE).
- SDK-free tutulur — cüzdan UI'ları Stellar SDK'sını import etmeden tüketebilir.

---

## x402 Ödeme Sistemi

HTTP 402 "Payment Required" üzerine kurulu mikro-ödeme akışı (Stellar exact scheme).

1. API key olmadan istek gelir → sunucu **402 + PaymentRequirements** döner
2. Kullanıcı Stellar üzerinden USDC öder (klasik asset ya da Soroban SAC)
3. Facilitator ödemeyi doğrular (`X402_FACILITATOR_URL`)
4. Analiz çalışır; başarılıysa ödeme kesinleştirilir (settlement)

Ağ kimliği: `stellar:testnet` / `stellar:pubnet`. Demo: `GET /demo/scrybe?q=…`.

---

## MCP — AI Agent Entegrasyonu

Sunucu Model Context Protocol'ü destekler (`/mcp/tools`, `/mcp/call`). Üç araç:
- `blackthorn_analyze` — işlem analiz et
- `blackthorn_health` — servis sağlıklı mı
- `blackthorn_list_profiles` — policy profillerini listele

---

## Audit Trail

Her analiz sonucu otomatik kaydedilir: zaman, network, karar (safe?), confidence, risk kodları, dokunulan kontratlar, birincil aksiyon, (varsa) kullanıcı cüzdanı, süre. Son **10.000** kayıt **bellekte** tutulur — kalıcı veritabanı yok, sunucu yeniden başlarsa sıfırlanır.

---

## API — Uç Nokta Özeti

| Yöntem | Adres | Ne yapar |
|--------|-------|----------|
| GET | `/health` | Sunucu ayakta mı |
| GET | `/health/ready` | Horizon (ve varsa x402 facilitator) hazır mı |
| POST | `/v1/analyze` | Tek işlem analizi |
| POST | `/v1/analyze/batch` | Toplu analiz (max 25) |
| POST | `/v1/analyze/stream` | Canlı sonuç akışı (SSE) |
| POST | `/v1/replay` | Simülasyonu yeniden çalıştır (bilgilendirici) |
| GET | `/v1/audit/recent` | Son analiz kayıtları |
| GET | `/v1/audit/aggregate` | Toplam istatistikler |
| GET | `/v1/audit/contract/:address` | Kontrat bazlı audit |
| GET / POST | `/mcp/tools` · `/mcp/call` | AI agent araçları |
| GET | `/demo/scrybe` | x402 demo paywall |

---

## Ortam Değişkenleri — Kritikler

| Değişken | Ne işe yarar |
|----------|-------------|
| `STELLAR_NETWORK` | `testnet` (varsayılan) veya `pubnet` |
| `STELLAR_HORIZON_URL` | **Zorunlu** — Horizon API endpoint'i |
| `STELLAR_SOROBAN_RPC_URL` | **Zorunlu** — Soroban RPC endpoint'i |
| `DELTAG_API_KEYS` | API erişim anahtarları (virgülle) |
| `RISKY_CONTRACT_IDS` | Tehlikeli Soroban kontrat id'leri (C…) |
| `KNOWN_SAFE_CONTRACT_IDS` | Güvenli kontrat allowlist'i |
| `X402_ENABLED` / `X402_PAY_TO` | x402 ödeme kapısı + alıcı Stellar adresi |

`STELLAR_HORIZON_URL` veya `STELLAR_SOROBAN_RPC_URL` yoksa sunucu açılışta çöker. Tam liste: `apps/server/.env.example`.

---

## Çalıştırma

```bash
pnpm install

# Yerel geliştirme
pnpm dev            # server API → :8080
pnpm dev:wallet     # cüzdan → :5180
pnpm dev:showcase   # showcase demoları
pnpm dev:extension  # eklenti (watch build)
pnpm dev:all        # server + wallet + showcase paralel

pnpm typecheck      # tüm paketler
pnpm test           # server testleri

# Docker (yalnızca API)
pnpm docker:up      # → http://localhost:18080
```

Üretim: sunucu **Render** (`render.yaml`), showcase **Vercel** (`vercel.json`).

---

## Tasarım Sistemi — BLACKTHORN

Kaynak: `docs/brand.md` + `packages/ui/src/tokens.css`.

- **Felsefe:** "Calm. Technical. Candid." — *"The hard hat for your Stellar wallet."*
- **Renkler:** beyaz/açık yüzeyler (`#FAF8F4` bone, `#FFFFFF` paper), güvenlik turuncusu vurgu (`#FF6B00`), mürekkep-siyahı metin (`#141414`); anlamsal: yeşil/amber/kırmızı/cyan.
- **Tipografi:** Inter (başlık/metin) + JetBrains Mono (adres/kod).

---

## Sınırlılıklar

- Simülasyon gerçek yürütmeyi garantilemez — ağ koşulları, zaman sınırı (timeBounds) dolması, ücret değişimleri sonucu değiştirebilir.
- Yalnızca Stellar `TransactionEnvelope` (base64 XDR) desteklenir.
- En fazla `MAX_SIMULATION_OPERATIONS` (varsayılan 20) hesap ön-duruma alınır; daha fazlası varsa analiz eksik kalabilir ve confidence düşürülür.
- Audit verisi yalnızca bellektedir (kalıcı depolama yok).
- Akıllı cüzdan adresi şu an placeholder — gerçek Soroban smart-wallet kontrat entegrasyonu yapılmamıştır.

---

## Mevcut Durum

### Çalışıyor
- Ana analiz motoru (tüm dedektörler + policy + öneri motoru)
- Batch + SSE streaming, simülasyon replay
- Audit trail (in-memory), reputation database
- MCP server (3 araç)
- x402 ödeme entegrasyonu (Stellar exact scheme)
- swig-guard SDK + wallet-adapter köprüsü
- Browser extension (Chrome MV3 + Firefox)
- Bağımsız demo cüzdan (Stellar'a taşındı)
- Showcase siteleri (6 senaryo) — Vercel'de
- Soroban payment-guard kontratı (`contracts/`)

### Eksik / Geliştirilebilir
- Audit için kalıcı depolama (şu an yalnızca bellek)
- Wallet'ta gerçek Soroban smart-wallet kontrat entegrasyonu (şu an placeholder)
- Reputation database'in genişletilmesi (seed verisiyle başlıyor)
- Çok-instance dağıtım için paylaşılan rate limiting (şu an IP bazlı, tek sunucu)
