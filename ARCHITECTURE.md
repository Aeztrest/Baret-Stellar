# DeltaG: Sistem Dokümantasyonu — Baştan Sona Her Parça

Bu doküman DeltaG projesinin tamamını, her modülü, her algoritmayı, her veri akışını açıklar. Hiçbir parça atlanmamıştır.

---

## İçindekiler

1. [Proje Nedir?](#1-proje-nedir)
2. [Genel Mimari](#2-genel-mimari)
3. [Sunucu Başlatma Akışı](#3-sunucu-başlatma-akışı)
4. [Konfigürasyon Sistemi](#4-konfigürasyon-sistemi)
5. [Bir İsteğin Hayat Döngüsü (Uçtan Uca)](#5-bir-isteğin-hayat-döngüsü)
6. [Transaction Decode](#6-transaction-decode)
7. [Address Lookup Table (ALT) Resolution](#7-address-lookup-table-alt-resolution)
8. [RPC Simülasyonu](#8-rpc-simülasyonu)
9. [CPI (Cross-Program Invocation) Tracing](#9-cpi-tracing)
10. [Bakiye Değişimi Hesaplama (Delta Extraction)](#10-bakiye-değişimi-hesaplama)
11. [Instruction Semantic Decode](#11-instruction-semantic-decode)
12. [Risk Tespit Sistemi](#12-risk-tespit-sistemi)
13. [Policy Engine](#13-policy-engine)
14. [Policy DSL ve Profiller](#14-policy-dsl-ve-profiller)
15. [Öneri Motoru (Suggestion Engine)](#15-öneri-motoru)
16. [Audit Trail ve Pattern History](#16-audit-trail)
17. [Reputation Database](#17-reputation-database)
18. [Token-2022 Extension Desteği](#18-token-2022)
19. [MCP Server (AI Agent Entegrasyonu)](#19-mcp-server)
20. [Batch ve Streaming Analiz](#20-batch-ve-streaming)
21. [Simulation Replay (Zaman Yolculuğu)](#21-simulation-replay)
22. [x402 Ödeme Sistemi](#22-x402-ödeme)
23. [Wallet Adapter SDK](#23-wallet-adapter-sdk)
24. [Browser Extension](#24-browser-extension)
25. [API Endpoint'leri Tam Listesi](#25-api-endpointleri)
26. [Veri Modelleri (Domain Types)](#26-veri-modelleri)
27. [Dosya Haritası](#27-dosya-haritası)

---

## 1. Proje Nedir?

DeltaG (DeltaGuard), Stellar blockchain üzerindeki transaction'ları **imzalamadan önce** analiz eden bir güvenlik protokolüdür.

**Ne yapıyor basitçe:**
Bir kullanıcı veya uygulama bir Stellar transaction'ı imzalamak üzere. Bu transaction gerçekten güvenli mi? DeltaG bu soruya cevap veriyor.

**Nasıl çalışıyor 3 cümlede:**
1. Transaction'ı alıyor, Stellar RPC'ye gönderiyor ve "bu transaction çalışsaydı ne olurdu?" diye simüle ettiriyor
2. Simülasyon sonucunu 7 farklı risk dedektöründen geçiriyor
3. Policy kurallarına göre "güvenli" veya "tehlikeli" kararı veriyor

**Kim kullanır:**
- Wallet'lar (Phantom, Solflare gibi) — kullanıcıya imzalamadan önce uyarı göstermek için
- dApp'ler — kendi kullanıcılarını korumak için
- AI agent'lar — otomatik transaction yapmadan önce kontrol etmek için

---

## 2. Genel Mimari

```
Proje Yapısı:
─────────────
DeltaProtokol/
├── apps/
│   ├── server/          ← Ana API sunucusu (Fastify + TypeScript)
│   └── web/             ← Demo web arayüzü (React + Vite)
├── packages/
│   ├── wallet-adapter/  ← Wallet entegrasyon SDK'sı
│   └── browser-extension/ ← Chrome extension
├── docker-compose.yml
└── pnpm-workspace.yaml  ← Monorepo yapısı
```

**Monorepo nedir?** Birden fazla proje (server, web, sdk, extension) tek bir Git repo'sunda yaşıyor. pnpm workspace ile yönetiliyor.

**Teknoloji seçimleri:**
- **Fastify**: Node.js web framework'ü. Express'e göre daha hızlı, TypeScript desteği daha iyi
- **@stellar/stellar-sdk**: Stellar blockchain ile konuşmak için resmi SDK
- **Zod**: Request/response doğrulama. Gelen veri şemasını kontrol ediyor
- **React + Vite**: Demo arayüz için

---

## 3. Sunucu Başlatma Akışı

Sunucu açıldığında ne oluyor, adım adım:

**Dosya: `src/index.ts`**
```
1. loadConfig() çağrılır → environment variable'lar okunur
2. buildApp(config) çağrılır → Fastify instance oluşturulur
3. app.listen() → Belirlenen port'ta dinlemeye başlar
```

**Dosya: `src/app.ts` — buildApp() ne yapıyor:**
```
1. Fastify instance oluştur (logger, body limit, timeout, trust proxy ayarla)
2. Rate limiting ekle (ddos koruması)
3. RPC adapter factory tanımla (her cluster için ayrı connection)
4. API key doğrulama hook'u ekle (her /v1/* isteğinde çalışır)
5. x402 ödeme sistemi varsa başlat
6. Route'ları kaydet:
   - Health routes (/health, /health/ready)
   - Analyze route (/v1/analyze)
   - Batch route (/v1/analyze/batch, /v1/analyze/stream)
   - MCP routes (/mcp/tools, /mcp/call)
   - Audit routes (/v1/audit/*)
   - Replay route (/v1/replay)
```

**Rate limiting nasıl çalışıyor?**
- IP bazlı. Varsayılan: 60 saniyede en fazla 200 istek
- /health endpoint'leri muaf (monitoring araçları bloklanmasın)
- `DELTAG_RATE_LIMIT_MAX=0` ile kapatılabilir

**API key doğrulama nasıl çalışıyor?**
- Her `/v1/` ile başlayan istekte çalışır
- `Authorization: Bearer <key>` veya `x-api-key` header'ına bakar
- Key `DELTAG_API_KEYS` listesinde yoksa → 401 döner
- x402 modu aktifse ve istek /v1/analyze ise → API key atlanabilir (ödeme ile erişim)

---

## 4. Konfigürasyon Sistemi

**Dosya: `src/config/index.ts`**

Tüm ayarlar environment variable'lardan gelir. Zod ile doğrulanır.

| Değişken | Ne İşe Yarar | Varsayılan |
|----------|-------------|------------|
| `PORT` | Sunucu portu | 8080 |
| `NODE_ENV` | development/test/production | development |
| `LOG_LEVEL` | Log detayı (trace→fatal) | info |
| `DELTAG_API_KEYS` | Virgülle ayrılmış API key'leri | (boş) |
| `DELTAG_AUTH_MODE` | api_key / x402 / both | api_key |
| `RPC_MAINNET_BETA` | Mainnet RPC URL | — |
| `RPC_DEVNET` | Devnet RPC URL | — |
| `RPC_TESTNET` | Testnet RPC URL | — |
| `RISKY_PROGRAM_IDS` | Tehlikeli program adresleri (virgülle) | (boş) |
| `KNOWN_SAFE_PROGRAM_IDS` | Güvenli program adresleri (virgülle) | (boş) |
| `MAX_SIMULATION_ACCOUNTS` | Simülasyona gönderilecek max hesap | 64 |
| `MAX_BODY_BYTES` | Max istek boyutu | 1MB |
| `REQUEST_TIMEOUT_MS` | İstek zaman aşımı | 25 saniye |
| `DELTAG_TRUST_PROXY` | Reverse proxy arkasında mı? | false |
| `X402_ENABLED` | x402 ödeme aktif mi? | false |
| `X402_PAY_TO` | Ödeme adresi (Stellar) | — |
| `X402_ANALYZE_PRICE` | İstek başı ücret | $0.001 |

**Doğrulama mantığı:**
- Zod şeması her değişkeni kontrol eder
- Yanlış tip veya geçersiz değer → sunucu hiç başlamaz, hata verir
- x402 açıksa ama `X402_PAY_TO` yoksa → hata
- `X402_PAY_TO` geçerli bir Stellar adresi değilse → hata

---

## 5. Bir İsteğin Hayat Döngüsü

Bir `POST /v1/analyze` isteği geldiğinde baştan sona ne oluyor:

```
İSTEK GELDİ
    │
    ▼
[1] Rate limit kontrolü (IP bazlı)
    │
    ▼
[2] API key doğrulama (veya x402 ödeme doğrulama)
    │
    ▼
[3] Request body Zod doğrulama
    │  - cluster: mainnet-beta/testnet/testnet olmalı
    │  - transactionBase64: boş olmamalı
    │  - policy: opsiyonel kurallar
    │  - userWallet: opsiyonel
    │
    ▼
[4] Transaction decode (base64 → Transaction nesnesi)
    │
    ▼
[5] ALT resolution (Address Lookup Table adreslerini çöz)
    │
    ▼
[6] Account pre-fetch (tüm hesapların mevcut durumunu RPC'den al)
    │
    ▼
[7] RPC simulateTransaction çalıştır
    │
    ▼
[8] Simülasyon sonucunu normalize et
    │
    ▼
[9] Bakiye değişimlerini hesapla (XLM + Token delta extraction)
    │
    ▼
[10] CPI trace oluştur (hangi program hangi programı çağırdı)
    │
    ▼
[11] Instruction'ları decode et (ne yapıyor bu transaction?)
    │
    ▼
[12] 7 Risk Dedektörü çalıştır:
    │   ├── Simülasyon başarısızlığı
    │   ├── Tehlikeli program tespiti
    │   ├── CPI derinlik analizi
    │   ├── Reputation kontrolü
    │   ├── Compute kullanım analizi
    │   ├── Delegate/approval değişim tespiti
    │   └── Eksik veri uyarısı
    │
    ▼
[13] Policy Engine: kuralları değerlendir → safe/blocked kararı ver
    │
    ▼
[14] Transaction annotation ekle (okunabilir özet + CPI trace)
    │
    ▼
[15] Suggestion engine çalıştır (iyileştirme önerileri)
    │
    ▼
[16] Audit store'a kaydet (istatistik için)
    │
    ▼
[17] Response doğrulama (Zod ile çıktıyı kontrol et)
    │
    ▼
[18] x402 varsa ödeme settlement'ı çalıştır
    │
    ▼
YANIT DÖN
```

---

## 6. Transaction Decode

**Dosya: `src/simulation/tx-decode.ts`**

**Ne yapıyor:** Base64 string'i alıp Stellar'nın anlayacağı Transaction nesnesine çeviriyor.

**Algoritma:**
```
1. Base64 string → Buffer'a çevir
2. Buffer → Transaction.deserialize()
3. Hata olursa (bozuk data, geçersiz format) → AnalyzeValidationError fırlat
```

**Transaction nedir?**
Stellar'da iki tür transaction var:
- **Legacy**: Eski format, max 35 account
- **Versioned (v0)**: Yeni format, Address Lookup Table ile 256+ account destekler

DeltaG sadece Transaction kabul eder. Legacy transaction'lar da versioned wire format'a çevrilerek gönderilebilir.

---

## 7. Address Lookup Table (ALT) Resolution

**Dosya: `src/simulation/account-keys.ts`**

**Problem:** v0 transaction'larda bazı hesap adresleri doğrudan transaction içinde değil, bir "Address Lookup Table" referansı olarak saklanır. Bu tablo RPC'den sorgulanmadan gerçek adresleri göremezsin.

**Eski durum:** Sadece `collectStaticAccountKeys()` vardı → static key'leri + ALT tablo adreslerini alıyordu ama ALT içindeki adresleri çözmüyordu.

**Şimdiki durum:** `resolveAllAccountKeys()` eklendi:

```
Algoritma:
1. Transaction'ın message'ından static key'leri al
2. addressTableLookups dizisine bak (ALT referansları)
3. Her ALT referansı için:
   a. RPC'ye getAddressLookupTable() çağrısı yap
   b. Dönen tablodaki writable index'lere karşılık gelen adresleri al
   c. Dönen tablodaki readonly index'lere karşılık gelen adresleri al
4. Static key'ler + ALT adresleri = tam account listesi
5. Tekrarlanan adresleri temizle (dedupe)
```

**Neden önemli:** Mainnet'te çoğu DeFi transaction'ı v0 formatında. ALT çözülmeden bu transaction'ların hesaplarının yarısı görünmez → simülasyon eksik, risk tespiti eksik, bakiye hesabı eksik.

---

## 8. RPC Simülasyonu

**Dosyalar: `src/infra/solana-rpc.ts`, `src/simulation/solana-simulator.ts`, `src/simulation/normalize-simulation.ts`**

### 8.1 RPC Adapter

`StellarRpcAdapter` sınıfı Stellar RPC node'u ile tüm iletişimi yönetir:

- `getMultipleAccountsInfo(keys)` → Hesapların mevcut durumunu toplu getir
- `simulateTransaction(tx, accountKeys)` → Transaction'ı simüle et
- `getAddressLookupTable(key)` → ALT tablosunu getir
- `pingRpc()` → RPC sağlık kontrolü

**Timeout mekanizması:**
```
Her RPC çağrısı:
1. AbortController ile timeout süresi başlat
2. Süre dolursa → AbortError
3. AbortError → StellarRpcError("RPC_TIMEOUT") 
4. Timeout hatasında → 1 kez otomatik retry
```

### 8.2 Simülasyon

`StellarSimulator.simulate()` ne yapıyor:

```
1. Transaction + account listesi al
2. RPC'ye simulateTransaction gönder:
   - sigVerify: false (imza kontrolü yapma, henüz imzalanmamış olabilir)
   - commitment: "confirmed"
   - accounts: { encoding: "base64", addresses: [...] }
3. RPC döner: logs, err, accounts (post-state), unitsConsumed, returnData
4. normalizeSimulation() ile standart formata çevir
```

### 8.3 Normalizasyon

`normalizeSimulation()` RPC'nin ham çıktısını `NormalizedSimulation` tipine çevirir:

```typescript
NormalizedSimulation = {
  status: "success" | "failed"     // Simülasyon başarılı mı?
  logs: string[]                    // Program log'ları
  err: string | null                // Hata mesajı (varsa)
  accounts: SimulationAccountState[] // Her hesabın post-state'i
  unitsConsumed: number | null      // Harcanan compute unit
  returnData: { programId, data }   // Program return data'sı
}
```

Her `SimulationAccountState`:
```typescript
{
  pubkey: string      // Hesap adresi
  stroops: number    // XLM bakiye (lamport cinsinden, 1 XLM = 1,000,000,000 lamport)
  owner: string       // Bu hesabı hangi program sahipleniyor
  dataBase64: string  // Hesap data'sı (token bilgisi vs.)
  executable: boolean // Program mı yoksa data hesabı mı
}
```

---

## 9. CPI Tracing

**Dosyalar: `src/simulation/cpi-parser.ts`, `src/domain/cpi-trace.ts`**

**CPI (Cross-Program Invocation) nedir?**
Stellar'da bir program başka bir programı çağırabilir. Örneğin:
```
Jupiter (aggregator) → Orca Whirlpool (DEX) → Token Program (transfer)
```
Bu "CPI zinciri" olarak adlandırılır. Sadece üst seviye instruction'lara bakarsan Jupiter'ı görürsün. Ama asıl token transfer'i Token Program'da oluyor.

**parseCpiTrace() algoritması:**

```
1. Transaction'ın compiled instruction'larını al
   - Her instruction: programIdIndex + data + account index'leri
   
2. Her top-level instruction için bir CpiNode oluştur:
   {
     programId: "Jupiter v6",
     instructionIndex: 0,
     depth: 0,
     children: [...]
   }

3. Inner instruction'lar varsa (simülasyondan):
   - Her inner instruction'ın stackHeight değerine bak
   - stackHeight'a göre ağaç yapısı oluştur (nesting)
   
4. Inner instruction yoksa:
   - Log satırlarından "Program XXX invoke" pattern'ini ara
   - Bu program ID'leri listeye ekle (heuristic fallback)

5. Sonuç CpiTrace:
   {
     roots: [CpiNode ağacı],
     allProgramIds: ["Jupiter", "Orca", "Token Program"],
     maxDepth: 3,
     totalInstructions: 12
   }
```

**Stack height nesting algoritması:**
```
Gelen flat liste: [depth:1, depth:2, depth:2, depth:1, depth:2]

Stack-based nesting:
- depth:1 → root child
- depth:2 → önceki depth:1'in child'ı
- depth:2 → aynı parent'ın ikinci child'ı
- depth:1 → yeni root child (stack geri sarılır)
- depth:2 → bu yeni depth:1'in child'ı

Sonuç: İç içe ağaç yapısı
```

---

## 10. Bakiye Değişimi Hesaplama

**Dosya: `src/analysis/extract-deltas.ts`**

Bu modül simülasyon öncesi ve sonrası hesap durumlarını karşılaştırarak ne değiştiğini hesaplar.

### 10.1 XLM Bakiye Değişimi

```
Her hesap için:
1. preLamports = pre-fetch'teki lamport değeri (simülasyon öncesi)
2. postLamports = simülasyondaki lamport değeri (simülasyon sonrası)
3. deltaLamports = postLamports - preLamports

Örnek:
  Hesap: 5xG...abc
  Önce: 2,500,000,000 lamport (2.5 XLM)
  Sonra: 2,000,000,000 lamport (2.0 XLM)
  Delta: -500,000,000 lamport (-0.5 XLM) ← Kullanıcı 0.5 XLM kaybetmiş
```

### 10.2 Token Bakiye Değişimi

```
Her hesap için:
1. Hesabın owner'ı Token Program veya Token-2022 mı kontrol et
2. Evet ise → Soroban SAC hesabı demektir
3. Post-state data'yı AccountLayout.decode() ile parse et:
   - mint: Hangi token?
   - owner: Kimin hesabı?
   - amount: Kaç token var?
4. Pre-state'i de aynı şekilde decode et
5. delta = postAmount - preAmount

Örnek:
  Token hesabı: 7yB...xyz
  Mint: USDC (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
  Owner: Kullanıcının wallet'ı
  Önce: 150,000,000 (150 USDC)
  Sonra: 270,000,000 (270 USDC)  
  Delta: +120,000,000 (+120 USDC)
```

### 10.3 Delegate/Approval Tespiti

```
Her token hesabı için:
1. Pre-state'te delegateOption ve delegate alanlarını oku
2. Post-state'te aynı alanları oku
3. Değiştiyse:
   - preDelegate null → postDelegate var = YENİ APPROVAL (tehlikeli!)
   - preDelegate var → postDelegate farklı = DELEGATE DEĞİŞİMİ (tehlikeli!)
```

### 10.4 Token Decimals Enrichment

```
Token delta'ları hesaplandıktan sonra:
1. Her token'ın mint hesabını bul (pre veya post data'dan)
2. MintLayout.decode() ile decimal sayısını al
3. Token change'e decimal ekle

Neden? 150000000 sayısı tek başına anlamsız. Decimal=6 bilgisiyle "150 USDC" olduğu anlaşılır.
```

---

## 11. Instruction Semantic Decode

**Dosya: `src/analysis/instruction-decoder.ts`**

Bu modül "bu transaction aslında ne yapıyor?" sorusuna okunabilir bir cevap üretir.

### 11.1 Bilinen Programlar Veritabanı

```
30+ program tanınıyor:
- System Program → XLM transfer, hesap oluşturma
- Soroban SAC → Token transfer, approve, revoke, burn, mint
- Soroban SAC-2022 → Aynı ama yeni standard
- Compute Budget → CU limit/price ayarı
- Jupiter v4/v6 → DEX aggregator swap
- Orca Whirlpool → DEX swap
- Raydium AMM/CLMM → DEX swap
- Meteora DLMM → DEX swap
- Phoenix → Orderbook DEX
- Marinade → Liquid staking
- Metaplex → NFT metadata
- Serum v3 → Orderbook DEX
- Vote/Stake → Validator operasyonları
```

### 11.2 Decode Algoritması

```
Her compiled instruction için:
1. programIdIndex'ten program adresini al
2. Bilinen programlar tablosunda ara

3. System Program ise:
   - İlk 4 byte = instruction type index
   - 0 = CreateAccount, 2 = Transfer, 3 = CreateAccountWithSeed, vb.
   - Transfer ise: byte 4-12 arası = lamport miktarı (little-endian uint64)
   - Çıktı: "Transfer 1.500000 XLM"

4. Token Program ise:
   - İlk byte = instruction type
   - 3 = Transfer, 4 = Approve, 5 = Revoke, 6 = SetAuthority, 7 = MintTo, 8 = Burn, vb.
   - Çıktı: "Token transfer" veya "Token approve delegate"

5. DEX programı ise:
   - Çıktı: "Jupiter v6 swap" veya "Orca Whirlpool swap"

6. Compute Budget ise:
   - Çıktı: "Set compute budget"

7. Hiçbiri değilse:
   - Çıktı: "Unknown Program instruction"
```

### 11.3 Primary Action ve Human Readable

```
Primary Action belirleme (öncelik sırası):
1. Swap varsa → primary = "swap"
2. Stake varsa → primary = "stake" 
3. SetAuthority varsa → primary = "set_authority"
4. Approve varsa → primary = "approve"
5. Transfer varsa → primary = "transfer"
... devamı: mint_to, burn, create_account, close_account, vote

Human-readable özet:
- Swap ise → "Token swap via Jupiter v6"
- Tek transfer ise → "Transfer 1.5 XLM"
- Birden fazla transfer ise → "3 transfer operations"
- Approve ise → "Token approval (delegate) operation"
```

---

## 12. Risk Tespit Sistemi

**Dosyalar: `src/risk/index.ts`, `src/risk/detectors/*.ts`**

7 bağımsız risk dedektörü paralel çalışır. Her biri `RiskFinding[]` döner.

### 12.1 Simulation Detector

**Dosya: `detectors/simulation.ts`**

```
Eğer simülasyon başarısızsa:
→ SIMULATION_FAILED (severity: high)
  "Transaction simulation failed; execution is unlikely to succeed"
```

Bu en basit ama en önemli dedektör. Simülasyon başarısızsa transaction zaten çalışmaz.

### 12.2 Program Detector

**Dosya: `detectors/programs.ts`**

```
İki kontrol:

1. Risky Program Kontrolü:
   - Transaction'daki her program ID'yi RISKY_PROGRAM_IDS listesinde ara
   - Bulursa → RISKY_PROGRAM_INTERACTION (severity: high)

2. Unknown Program Kontrolü (opsiyonel):
   - KNOWN_SAFE_PROGRAM_IDS listesi dolu ise aktif
   - Her program ID'yi bu listede + IMPLICIT_ALLOW listesinde ara
   - IMPLICIT_ALLOW: System Program, Token Program, ComputeBudget, Vote, Stake, vb.
   - Listede yoksa → UNKNOWN_PROGRAM_EXPOSURE (severity: medium)
```

### 12.3 CPI Detector

**Dosya: `detectors/cpi.ts`**

```
1. CPI Derinlik Kontrolü:
   - maxDepth > 4 ise → DEEP_CPI_NESTING (severity: medium)
   - Normal DeFi: 2-3 derinlik. 4+ olağandışı.

2. Instruction Sayısı Kontrolü:
   - totalInstructions > 30 ise → HIGH_INSTRUCTION_COUNT (severity: low)
   - Çok fazla instruction saldırı işareti olabilir

3. CPI Zincirinde Risky Program:
   - CPI trace'teki TÜM program ID'leri RISKY listesinde aranır
   - Top-level'da görünmeyen ama CPI ile çağrılan tehlikeli programlar yakalanır
   → RISKY_PROGRAM_INTERACTION (severity: high, detectedVia: "cpi_trace")
```

### 12.4 Reputation Detector

**Dosya: `detectors/reputation.ts`**

```
1. CPI trace'ten tüm program ID'leri al
2. Simülasyondaki tüm hesap adreslerini al
3. Hepsini reputation veritabanında ara
4. Eşleşme varsa → KNOWN_MALICIOUS_ADDRESS
   - severity: veritabanındaki entry'e göre (high/medium/low)
   - details: adres, label, kategori, kaynak
```

### 12.5 Compute Detector

**Dosya: `detectors/compute.ts`**

```
Simülasyonun unitsConsumed değeri > 1,200,000 ise:
→ EXCESSIVE_COMPUTE_USAGE (severity: medium)
  "Transaction consumed X compute units, exceeding threshold"

Neden önemli: Aşırı CU kullanımı:
- Transaction'ın blok limitlerine yaklaşması
- Potansiyel exploit/saldırı işareti
- Congestion'da başarısız olma riski
```

### 12.6 Delta Detector

**Dosya: `detectors/deltas.ts`**

```
1. Approval Kontrolü:
   - Yeni delegate set edildiyse → APPROVAL_CHANGE_DETECTED (severity: high)
   - Bu çok tehlikeli: delegate token'larınızı sizin yerinize harcayabilir

2. Delegate Değişim Kontrolü:
   - Delegate değiştiyse → DELEGATE_CHANGE_DETECTED (severity: high)

3. Eksik Veri Kontrolü:
   - Account listesi truncate edilmişse veya
   - Balance kuralları var ama userWallet verilmemişse
   → LOW_CONFIDENCE_INCOMPLETE_DATA (severity: medium)
```

### 12.7 Risk Finding Tipleri (Tam Liste)

| Kod | Severity | Ne Demek |
|-----|----------|----------|
| SIMULATION_FAILED | high | Simülasyon başarısız, tx çalışmaz |
| RISKY_PROGRAM_INTERACTION | high | Tehlikeli listedeki program çağrılıyor |
| UNKNOWN_PROGRAM_EXPOSURE | medium | Bilinmeyen program çağrılıyor |
| APPROVAL_CHANGE_DETECTED | high | Token delegate/approval set ediliyor |
| DELEGATE_CHANGE_DETECTED | high | Token delegate değişiyor |
| LOW_CONFIDENCE_INCOMPLETE_DATA | medium | Eksik veri, analiz güvenilirliği düşük |
| DEEP_CPI_NESTING | medium | CPI derinliği normalden fazla |
| HIGH_INSTRUCTION_COUNT | low | Çok fazla instruction |
| KNOWN_MALICIOUS_ADDRESS | high/medium | Bilinen kötü aktör adresi |
| EXCESSIVE_COMPUTE_USAGE | medium | Aşırı compute kullanımı |
| TOKEN2022_TRANSFER_HOOK | high | Transfer hook extension'ı var |
| TOKEN2022_PERMANENT_DELEGATE | high | Permanent delegate var |
| POST_BALANCE_TOO_LOW | high | İşlem sonrası bakiye minimum altında |
| ESTIMATED_LOSS_EXCEEDS_MAX | high | Tahmini kayıp max'ı aşıyor |
| LOSS_PERCENT_UNAVAILABLE | high | Kayıp yüzdesi hesaplanamıyor |

---

## 13. Policy Engine

**Dosya: `src/policy/engine.ts`**

Tüm risk finding'ler toplandıktan sonra Policy Engine devreye girer. Konfigüre edilebilir kurallarla nihai `safe: true/false` kararını verir.

### 13.1 evaluatePolicy() Algoritması

```
Girdiler:
- policy: Kurallar (request body'den gelen)
- simulation: Simülasyon sonucu
- estimatedChanges: Bakiye değişimleri
- riskFindings: Risk bulguları
- usdcMint: Cluster'a göre USDC mint adresi
- userWallet: Kullanıcı wallet adresi

Adımlar:

1. Simülasyon kontrolü:
   - policy.requireSuccessfulSimulation ≠ false VE simulation.status = "failed"
   → Blokla: "Simulation did not succeed; blocking under policy"

2. Risky program kontrolü:
   - policy.blockRiskyPrograms = true VE RISKY_PROGRAM_INTERACTION bulgusu var
   → Blokla

3. Unknown program kontrolü:
   - policy.blockUnknownProgramExposure = true VE UNKNOWN_PROGRAM_EXPOSURE var
   - VE policy.allowWarnings ≠ true
   → Blokla

4. Approval kontrolü:
   - policy.blockApprovalChanges = true VE APPROVAL_CHANGE_DETECTED var
   → Blokla

5. Delegate kontrolü:
   - policy.blockDelegateChanges = true VE DELEGATE_CHANGE_DETECTED var
   → Blokla

6. Max kayıp yüzdesi kontrolü:
   - policy.maxLossPercent ayarlıysa:
     a. userWallet yoksa → Blokla (hesaplayamam)
     b. User wallet'ın XLM pre/post değerlerini bul
     c. lossRatio = max(0, -deltaLamports / preLamports) * 100
     d. lossRatio > maxLossPercent → Blokla
     
   Örnek: preLamports=1000, deltaLamports=-600
   Loss = 60%. maxLossPercent=50 ise → BLOK

7. Min token bakiye kontrolü:
   - policy.minPostUsdcBalance ayarlıysa:
     a. İlgili mint'in token hesabını bul
     b. postAmount < minPostUsdcBalance (decimal'e göre ölçeklenmiş)
     → Blokla

8. Güven seviyesi hesapla:
   - LOW_CONFIDENCE_INCOMPLETE_DATA varsa → "low"
   - Simülasyon başarısızsa → "low"
   - Token decimal bilinmeyenler varsa → "medium"
   - Aksi halde → "high"

9. Nihai karar:
   - Herhangi bir blok nedeni varsa → safe: false
   - Yoksa → safe: true
```

### 13.2 Policy Giriş Parametreleri

```typescript
policy: {
  maxLossPercent?: number          // Max XLM kayıp yüzdesi (0-100)
  minPostUsdcBalance?: number      // Min token bakiyesi (UI cinsinden, ör: 10.5)
  minPostTokenMint?: string        // Hangi token için? (varsayılan: USDC)
  blockApprovalChanges?: boolean   // Approval'ları blokla
  blockDelegateChanges?: boolean   // Delegate değişimlerini blokla
  blockRiskyPrograms?: boolean     // Risky programları blokla
  blockUnknownProgramExposure?: boolean  // Bilinmeyen programları blokla
  allowWarnings?: boolean          // Warning'lere rağmen izin ver
  requireSuccessfulSimulation?: boolean  // Simülasyon başarılı olmalı mı
}
```

---

## 14. Policy DSL ve Profiller

**Dosyalar: `src/policy/dsl.ts`, `src/policy/profiles.ts`**

Basit boolean kuralların ötesinde, zengin bir kural dili.

### 14.1 Kural Yapısı

```typescript
PolicyRule = {
  id: "strict-sim-fail",
  name: "Block failed simulation",
  conditions: [
    { field: "simulation.status", operator: "eq", value: "failed" }
  ],
  action: "block",        // allow / block / warn
  reason: "Simulation failed",
  priority: 100           // Yüksek öncelik → önce değerlendirilir
}
```

### 14.2 Desteklenen Field'lar

| Field | Ne Döner | Tip |
|-------|---------|-----|
| `simulation.status` | "success" veya "failed" | string |
| `simulation.unitsConsumed` | Harcanan CU | number |
| `solLossPercent` | XLM kayıp yüzdesi | number |
| `totalTokenChanges` | Token değişim sayısı | number |
| `programIds` | Çağrılan program adresleri | string[] |
| `userWallet` | Kullanıcı wallet adresi | string |
| `riskFindings.codes` | Risk bulgu kodları | string[] |
| `riskFindings.count` | Toplam bulgu sayısı | number |
| `riskFindings.highCount` | High severity bulgu sayısı | number |
| `estimatedChanges.approvals.count` | Approval sayısı | number |
| `estimatedChanges.delegates.count` | Delegate değişim sayısı | number |

### 14.3 Desteklenen Operatörler

| Operatör | Anlamı | Örnek |
|----------|--------|-------|
| `eq` | Eşit | status eq "failed" |
| `neq` | Eşit değil | status neq "success" |
| `gt` | Büyük | loss gt 50 |
| `lt` | Küçük | count lt 5 |
| `gte` | Büyük eşit | depth gte 4 |
| `lte` | Küçük eşit | cu lte 1000000 |
| `in` | Listede var mı | programId in ["Jup...", "Orca..."] |
| `not_in` | Listede yok mu | programId not_in ["risky1", "risky2"] |
| `contains` | Dizi bu değeri içeriyor mu | riskCodes contains "KNOWN_MALICIOUS" |
| `exists` | null değil mi | userWallet exists |

### 14.4 Hazır Profiller

**Strict (Katı):**
```
- Simülasyon başarısızsa → blokla
- Approval değişikliği varsa → blokla
- High severity bulgu varsa → blokla
```

**DeFi Permissive (Esnek):**
```
- Simülasyon başarısızsa → blokla
- Bilinen kötü aktör varsa → blokla
- XLM kaybı %50'yi aşarsa → uyar (bloklamaz)
```

**Monitor Only (Sadece İzle):**
```
- Hiçbir zaman bloklamaz
- Tüm bulguları raporlar
- Dashboard/monitoring için
```

---

## 15. Öneri Motoru (Suggestion Engine)

**Dosya: `src/analysis/suggestion-engine.ts`**

Transaction analiz edildikten sonra "bunu nasıl iyileştirebilirsin" önerileri üretir.

### 15.1 Kontrol Edilen Durumlar

**Compute Budget eksikliği:**
```
Eğer:
- ComputeBudget instruction'ı yoksa
- VE simülasyonda 200,000+ CU harcanmışsa
→ Öneri: "SetComputeUnitLimit(harcanan × 1.2) ekle"
Severity: warning, autoFix: true
```

**Yüksek compute kullanımı:**
```
Eğer unitsConsumed > 1,000,000:
→ Öneri: "1.4M limite yakın, congestion'da başarısız olabilir"
Severity: warning, autoFix: false
```

**Unlimited approval:**
```
Her approval change için:
→ Öneri: "Sınırsız token approval tespit edildi. Belirli bir limit koy."
Severity: critical, autoFix: true
```

**Swap slippage uyarısı:**
```
Primary action = swap ise:
→ Öneri: "Slippage toleransını kontrol et (önerilen: %3 veya altı)"
Severity: info, autoFix: false
```

**Priority fee eksikliği:**
```
Swap transaction + priority fee yok ise:
→ Öneri: "SetComputeUnitPrice ekle, yoksa congestion'da yavaş kalır"
Severity: warning, autoFix: true
```

**High findings uyarısı:**
```
Transaction safe ama high-severity finding var ise:
→ Öneri: "Policy geçti ama X adet high-severity bulgu var, imzalamadan önce incele"
Severity: warning, autoFix: false
```

---

## 16. Audit Trail

**Dosya: `src/data/audit-store.ts`**

Her analiz sonucu otomatik olarak kaydedilir.

### 16.1 Kayıt Yapısı

```typescript
AuditEntry = {
  id: "uuid",
  timestamp: "2025-06-15T14:30:00Z",
  cluster: "mainnet-beta",
  safe: false,
  confidence: "high",
  riskCodes: ["RISKY_PROGRAM_INTERACTION", "DEEP_CPI_NESTING"],
  programIds: ["Jupiter", "Orca", "ShadyProgram"],
  primaryAction: "swap",
  userWallet: "5xG...abc" | null,
  durationMs: 1250
}
```

### 16.2 Pattern İstatistikleri

Her program için otomatik istatistik tutulur:
```typescript
PatternStats = {
  programId: "ShadyProgram...",
  totalSeen: 47,          // Toplam kaç kez görüldü
  blockedCount: 38,       // Kaç kez bloklandı
  riskCodes: {             // Hangi risk kodları kaç kez
    "RISKY_PROGRAM_INTERACTION": 38,
    "DEEP_CPI_NESTING": 12
  },
  lastSeen: "2025-06-15T14:30:00Z"
}
```

### 16.3 Aggregate Insight

```
Toplam analizler: 1,247
Güvenli: 1,089
Bloklanan: 158
En sık risk kodu: UNKNOWN_PROGRAM_EXPOSURE (234)
En çok bloklanan program: ShadyProgram... (38 kez)
Zaman aralığı: 2025-06-14 → 2025-06-15
```

### 16.4 Depolama

- In-memory ring buffer: Son 10,000 kayıt
- Sunucu restart'ında kaybolur (persistent storage değil, gelecekte eklenebilir)
- Ana analyze pipeline'a otomatik bağlı (best-effort, hata fırlatmaz)

---

## 17. Reputation Database

**Dosya: `src/data/reputation-db.ts`**

Bilinen kötü aktör adresleri veritabanı.

### 17.1 Veri Yapısı

```typescript
ReputationEntry = {
  address: "DrainerXXXX...",
  label: "Known drainer program",
  category: "drainer" | "phishing" | "scam_token" | "sanctioned" | "exploit" | "suspicious",
  severity: "high" | "medium" | "low",
  source: "community" | "blowfish" | "blockaid" | "manual",
  addedAt: "2025-01-01"
}
```

### 17.2 Nasıl Çalışıyor

```
1. Sunucu başladığında → Bilinen kötü aktörler yüklenir (hardcoded seed)
2. Runtime'da → addEntry() / addBatch() ile yeni adresler eklenebilir
3. Her analiz sırasında:
   a. Transaction'daki TÜM program ID'leri (CPI dahil) alınır
   b. Simülasyondaki TÜM hesap adresleri alınır
   c. Hepsi veritabanında aranır (Map lookup, O(1))
   d. Eşleşme → KNOWN_MALICIOUS_ADDRESS finding
```

---

## 18. Token-2022 Extension Desteği

**Dosya: `src/analysis/token2022.ts`**

Token-2022 Stellar'nın yeni token standardı. Klasik Soroban SAC'a göre "extension" desteği var — token'a özel davranışlar eklenebilir.

### 18.1 Tehlikeli Extension'lar

| Extension | Neden Tehlikeli |
|-----------|-----------------|
| **TransferHook** | Her token transfer'inde custom kod çalıştırır. Kötü niyetli hook token'ı geri çalabilir |
| **PermanentDelegate** | Token sahibi olmadan token'ları hareket ettirebilen kalıcı yetkili. Paranızı sizden habersiz alabilir |

### 18.2 Tespit Algoritması

```
1. Mint hesabının data'sını al
2. Owner Token-2022 program mı kontrol et (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb)
3. Data boyutu > 82 byte ise (standart mint layout'u = 82 byte):
   a. Offset 82'den itibaren extension header'ları oku
   b. Her 4 byte: 2 byte extension type + 2 byte extension length
   c. Extension type'a göre sınıflandır:
      - Type 14 → TransferHook (risky: true)
      - Type 19 → PermanentDelegate (risky: true)
      - Type 12 → DefaultAccountState
      - Type 18 → NonTransferable
      - Type 1 → TransferFee
      - Type 3 → ConfidentialTransfer
4. Risky extension bulunursa → TOKEN2022_TRANSFER_HOOK / TOKEN2022_PERMANENT_DELEGATE finding
```

---

## 19. MCP Server

**Dosyalar: `src/mcp/server.ts`, `src/api/routes/mcp.ts`**

MCP (Model Context Protocol) AI agent'ların araç olarak kullanabileceği standart bir iletişim protokolü. DeltaG bir MCP server olarak çalışabilir.

### 19.1 Sunulan Araçlar

| Tool | Açıklama |
|------|----------|
| `deltag_analyze` | Transaction analiz et |
| `deltag_health` | Servis sağlık kontrolü |
| `deltag_list_profiles` | Policy profilleri listele |

### 19.2 Nasıl Çalışıyor

```
AI Agent:
  "Bu transaction güvenli mi?" 
  → deltag_analyze({ transactionBase64: "...", cluster: "mainnet-beta" })

DeltaG:
  1. Normal analyze pipeline çalıştır
  2. Sonucu agent-friendly markdown formatına çevir:
  
  ## Transaction Analysis Result
  **Verdict**: SAFE
  **Confidence**: high
  **Summary**: Token swap via Jupiter v6
  **Programs**: Jupiter v6, Orca Whirlpool, Soroban SAC
  
  ### Risk Findings
  - [MEDIUM] UNKNOWN_PROGRAM_EXPOSURE: ...
  
  ### XLM Changes
  - 5xG...abc: -0.500000 XLM
```

### 19.3 API Endpoint'leri

- `GET /mcp/tools` → Mevcut araç tanımlarını döner (JSON Schema formatında)
- `POST /mcp/call` → `{ tool: "deltag_analyze", arguments: {...} }` → Sonuç döner

---

## 20. Batch ve Streaming Analiz

**Dosya: `src/api/routes/batch.ts`**

### 20.1 Batch Endpoint

`POST /v1/analyze/batch`

```
Girdi: { transactions: [tx1, tx2, ..., tx25] }
Max: 25 transaction

Algoritma:
1. Tüm transaction'ları paralel Promise.allSettled ile analiz et
2. Her biri bağımsız başarılı/başarısız olabilir
3. Sonuçları index sırasına göre sırala

Çıktı:
{
  count: 5,
  results: [
    { index: 0, status: "success", decision: {...} },
    { index: 1, status: "error", error: { code: "RPC_ERROR", message: "..." } },
    ...
  ],
  summary: {
    safe: 3,
    blocked: 1,
    errors: 1
  }
}
```

### 20.2 SSE Streaming Endpoint

`POST /v1/analyze/stream`

```
Girdi: { transactions: [tx1, tx2, ..., tx25] }

Algoritma:
1. SSE (Server-Sent Events) bağlantısı aç
2. "start" event'i gönder: { total: 5 }
3. Her transaction'ı SIRALI analiz et
4. Her analiz bittiğinde "result" event'i gönder: { index: 0, status: "success", decision: {...} }
5. Tümü bittiğinde "complete" event'i gönder
6. Bağlantıyı kapat

Neden SSE?
- Client sonuçları gerçek zamanlı alır
- 25 transaction'ın hepsini beklemek yerine birer birer görür
- Bağlantı kopsa bile alınan sonuçlar kaybolmaz
```

---

## 21. Simulation Replay

**Dosyalar: `src/simulation/replay.ts`, `src/api/routes/replay.ts`**

"Bu transaction 10 dakika önce çalışsaydı ne olurdu?" sorusuna cevap verir.

### 21.1 Nasıl Çalışıyor

```
POST /v1/replay
{
  cluster: "mainnet-beta",
  transactionBase64: "...",
  slot: 250000000  // opsiyonel: hangi slot'ta simüle etmek istiyorsun
}

Algoritma:
1. Transaction decode et
2. ALT adresleri çöz
3. Account listesini oluştur
4. RPC'ye simülasyon gönder
5. Sonucu döndür:
   {
     simulation: { status, logs, accounts, ... },
     replaySlot: 250000000,
     replayedAt: "2025-06-15T14:30:00Z",
     isHistorical: true
   }
```

### 21.2 Slot Karşılaştırma

`compareSlots()` metodu birden fazla slot'ta simülasyon yapıp karşılaştırır:
```
Slot 249999000 → success
Slot 250000000 → failed   ← statusChanged: true
Slot 250001000 → success

Bu sayede bir exploit'in tam olarak hangi slot aralığında etkili olduğu tespit edilebilir.
```

---

## 22. x402 Ödeme Sistemi

**Dosyalar: `src/infra/x402.ts`, `src/infra/x402-fastify-adapter.ts`**

x402, HTTP 402 "Payment Required" status kodu üzerine kurulu bir ödeme protokolü. Makineler arası mikro ödemeler için tasarlanmış.

### 22.1 Akış

```
1. Client POST /v1/analyze gönderir (ödeme header'ı olmadan)
2. x402 aktifse ve API key yoksa:
   - Sunucu 402 döner: "Ödeme gerekli, X-402-Payment header'ında bu kadar USDC gönder"
3. Client ödemeyi Stellar üzerinden yapar, kanıtı header'a ekler
4. Sunucu → Facilitator'a gönderir: "Bu ödeme gerçek mi?"
5. Facilitator doğrularsa → Analiz çalışır
6. Analiz başarılıysa VE response doğrulaması geçerse → Settlement (ödeme kesinleştirilir)
7. Analiz veya doğrulama başarısızsa → Settlement YAPILMAZ (para geri kalır)
```

### 22.2 Önemli Detay

Settlement (ödeme kesinleştirme) SADECE şu durumda çalışır:
- Analiz başarıyla tamamlandı
- Response Zod doğrulamasından geçti
- HTTP 200 dönecek

Bu sayede kullanıcı başarısız bir analiz için para ödemez.

---

## 23. Wallet Adapter SDK

**Paket: `packages/wallet-adapter/`**

Wallet geliştiricilerin DeltaG'yi entegre etmesi için hazır SDK.

### 23.1 DeltaGClient

```typescript
const client = new DeltaGClient({
  endpoint: "https://api.deltag.io",
  apiKey: "your-key",
  timeout: 15000
});

const result = await client.analyze({
  cluster: "mainnet-beta",
  transactionBase64: "...",
  userWallet: "5xG..."
});
// result.safe === true/false
```

### 23.2 Interceptor

`createDeltaGInterceptor()` — wallet'ın `signTransaction` fonksiyonunu sarmalayarak otomatik analiz yapar:

```
Akış:
1. Kullanıcı bir transaction imzalamak istiyor
2. wrapSignTransaction() çağrılır
3. Transaction serialize → base64
4. DeltaG API'ye gönder
5. Sonuç:
   - safe=true → signFn() çağrılır (imzala)
   - safe=false + autoBlock=true → TransactionBlockedError fırlatılır
   - safe=false + onBlocked callback tanımlı → callback sonucuna göre karar
   - Analiz hatası → signFn() çağrılır (fail-open: analiz çalışmazsa bloklamaz)
```

### 23.3 Callback'ler

```typescript
const interceptor = createDeltaGInterceptor({
  endpoint: "https://api.deltag.io",
  autoBlock: true,
  callbacks: {
    onAnalysisStart: (txBase64) => showSpinner(),
    onAnalysisComplete: (result) => hideSpinner(),
    onAnalysisError: (err) => logError(err),
    onBlocked: (result) => {
      return confirm("Transaction blocked! Proceed anyway?");
    },
    onWarning: (result) => {
      return confirm("Warnings found. Continue?");
    }
  }
});
```

---

## 24. Browser Extension

**Paket: `packages/browser-extension/`**

Chrome/Chromium tabanlı tarayıcılarda çalışan extension. Herhangi bir dApp'te Stellar transaction imzalanırken araya girer.

### 24.1 Bileşenler

| Dosya | Rol |
|-------|-----|
| `manifest.json` | Extension tanımı (MV3) |
| `content.js` | Sayfa içine enjekte edilen script |
| `background.js` | Service worker (API iletişimi) |
| `popup.html/js` | Ayarlar popup'ı |

### 24.2 Çalışma Mekanizması

```
[Sayfa yüklendi]
    │
    ▼
content.js sayfaya INJECT_SCRIPT enjekte eder
    │
    ▼
INJECT_SCRIPT:
1. window.solana, window.phantom.solana, window.backpack.solana, 
   window.solflare nesnelerini tara
2. signTransaction fonksiyonunu proxy ile değiştir:
   
   Orijinal: wallet.signTransaction(tx) → imzalanmış tx
   
   Proxy: wallet.signTransaction(tx) → {
     a. Transaction'ı serialize et → base64
     b. window.postMessage ile content.js'e gönder
     c. Content.js → background.js'e chrome.runtime.sendMessage
     d. Background.js → DeltaG API'ye fetch
     e. Sonuç geri gelir
     f. safe=true → orijinal signTransaction çağrılır
     g. safe=false + autoBlock → Error fırlatılır
   }

3. 2 saniyede bir wallet nesneleri taranır (lazy-load durumu için)
4. MutationObserver ile DOM değişiklikleri izlenir
```

### 24.3 İletişim Zinciri

```
[Sayfa bağlamı]          [Content Script]        [Background]        [DeltaG API]
INJECT_SCRIPT            content.js              background.js
     │                        │                       │                    │
     │ window.postMessage     │                       │                    │
     │ ──────────────────→    │                       │                    │
     │ (to_content)           │ chrome.runtime        │                    │
     │                        │ .sendMessage           │                    │
     │                        │ ──────────────────→    │                    │
     │                        │                        │ fetch POST         │
     │                        │                        │ /v1/analyze        │
     │                        │                        │ ──────────────→    │
     │                        │                        │                    │
     │                        │                        │ ←──────────────    │
     │                        │                        │  { safe, reasons } │
     │                        │ ←──────────────────    │                    │
     │                        │  sendResponse          │                    │
     │ ←──────────────────    │                       │                    │
     │ window.postMessage     │                       │                    │
     │ (from_content)         │                       │                    │
```

### 24.4 Popup Ayarları

- DeltaG API endpoint (varsayılan: http://localhost:8080)
- API key (opsiyonel)
- Cluster seçimi (mainnet/testnet/testnet)
- Auto-block toggle (tehlikeli transaction'ları otomatik blokla)
- Bağlantı durumu göstergesi (yeşil/kırmızı dot)

---

## 25. API Endpoint'leri Tam Listesi

| Metod | Path | Açıklama | Auth |
|-------|------|----------|------|
| GET | `/health` | Sunucu yaşıyor mu? | Yok |
| GET | `/health/ready` | RPC + x402 hazır mı? | Yok |
| POST | `/v1/analyze` | Tek transaction analiz | API key veya x402 |
| POST | `/v1/analyze/batch` | Toplu analiz (max 25) | API key |
| POST | `/v1/analyze/stream` | SSE streaming analiz | API key |
| POST | `/v1/replay` | Simülasyon replay | API key |
| GET | `/v1/audit/recent` | Son analizler | API key |
| GET | `/v1/audit/aggregate` | İstatistikler | API key |
| GET | `/v1/audit/program/:id` | Program bazlı audit | API key |
| GET | `/mcp/tools` | MCP araç listesi | API key |
| POST | `/mcp/call` | MCP araç çağrısı | API key |

---

## 26. Veri Modelleri (Domain Types)

### 26.1 Decision (Ana Çıktı)

```typescript
Decision = {
  safe: boolean,                    // Güvenli mi?
  reasons: string[],                // Neden güvenli/tehlikeli
  estimatedChanges: {               // Bakiye değişimleri
    sol: SolBalanceChange[],
    tokens: TokenBalanceChange[],
    approvals: ApprovalRecord[],
    delegates: DelegateRecord[]
  },
  riskFindings: RiskFinding[],      // Risk bulguları
  simulationWarnings: string[],     // Simülasyon uyarıları
  annotation?: {                    // Zenginleştirilmiş bilgi
    summary: TransactionSummary,    // "Jupiter üzerinden XLM→USDC swap"
    cpiTrace: CpiTrace              // Program çağrı ağacı
  },
  suggestions?: Suggestion[],       // İyileştirme önerileri
  meta: {
    analysisVersion: "v1",
    cluster: "mainnet-beta",
    simulatedAt: "2025-06-15T14:30:00Z",
    confidence: "high" | "medium" | "low",
    integratorRequestId?: string
  }
}
```

### 26.2 CpiTrace

```typescript
CpiTrace = {
  roots: CpiNode[],          // Üst seviye instruction ağaçları
  allProgramIds: string[],    // Tüm çağrılan programlar (CPI dahil)
  maxDepth: number,           // En derin CPI seviyesi
  totalInstructions: number   // Toplam instruction sayısı (CPI dahil)
}

CpiNode = {
  programId: string,
  instructionIndex: number,
  depth: number,
  children: CpiNode[],        // Bu program'ın CPI ile çağırdıkları
  data?: string,
  accounts?: string[]
}
```

### 26.3 TransactionSummary

```typescript
TransactionSummary = {
  instructions: DecodedInstruction[],  // Her instruction decode edilmiş
  humanReadable: string,                // "Token swap via Jupiter v6"
  primaryAction: InstructionAction,     // "swap"
  involvedPrograms: string[]            // ["Jupiter v6", "Orca Whirlpool"]
}
```

---

## 27. Dosya Haritası

```
apps/server/src/
│
├── index.ts                           Sunucu giriş noktası
├── app.ts                             Fastify uygulaması + route kayıtları
│
├── config/
│   └── index.ts                       Environment variable → AppConfig
│
├── application/
│   └── analyze-transaction.ts         ANA PIPELINE: tüm adımları orkestre eder
│
├── domain/                            Veri tipleri (iş mantığından bağımsız)
│   ├── decision.ts                    Decision, DecisionMeta, TransactionAnnotation
│   ├── estimated-changes.ts           XLM/Token bakiye değişimleri
│   ├── findings.ts                    RiskFinding, RiskFindingCode
│   ├── policy.ts                      Policy şeması (Zod) + AnalyzeRequestBody
│   ├── simulation-normalized.ts       NormalizedSimulation, SimulationAccountState
│   ├── cpi-trace.ts                   CpiNode, CpiTrace
│   └── instruction-summary.ts         DecodedInstruction, TransactionSummary
│
├── simulation/                        Stellar RPC simülasyon katmanı
│   ├── tx-decode.ts                   Base64 → Transaction
│   ├── account-keys.ts               Static key + ALT resolution
│   ├── solana-simulator.ts           Simülasyon orkestratörü
│   ├── normalize-simulation.ts        Raw RPC → NormalizedSimulation
│   ├── cpi-parser.ts                 CPI ağacı parser'ı
│   └── replay.ts                      Tarihsel simülasyon replay
│
├── analysis/                          Post-simülasyon analiz
│   ├── extract-deltas.ts             XLM/Token bakiye değişimi hesaplama
│   ├── instruction-decoder.ts         Instruction semantic decode
│   ├── suggestion-engine.ts           İyileştirme önerileri
│   └── token2022.ts                   Token-2022 extension tespit
│
├── risk/                              Risk tespit sistemi
│   ├── index.ts                       7 dedektörü orkestre eder
│   └── detectors/
│       ├── simulation.ts              Simülasyon başarısızlığı
│       ├── programs.ts                Risky/unknown program tespiti
│       ├── cpi.ts                     CPI derinlik + risky CPI program
│       ├── reputation.ts              Bilinen kötü aktör adresi
│       ├── compute.ts                 Aşırı compute kullanımı
│       └── deltas.ts                  Delegate/approval + eksik veri
│
├── policy/                            Karar motoru
│   ├── engine.ts                      Ana policy değerlendirme (evaluatePolicy)
│   ├── dsl.ts                         Kural dili + koşul değerlendirme
│   └── profiles.ts                    Hazır policy profilleri
│
├── data/                              Veri katmanı
│   ├── audit-store.ts                 Analiz kayıtları + istatistikler
│   └── reputation-db.ts              Kötü aktör veritabanı
│
├── mcp/
│   └── server.ts                      MCP tool tanımları + handler'lar
│
├── infra/                             Altyapı
│   ├── solana-rpc.ts                  Stellar RPC adapter (timeout, retry)
│   ├── x402.ts                        x402 ödeme sistemi kurulumu
│   ├── x402-fastify-adapter.ts        x402 Fastify entegrasyonu
│   └── logger.ts                      Pino logger konfigürasyonu
│
└── api/                               HTTP katmanı
    ├── errors.ts                      Standart hata formatı
    ├── extract-api-key.ts             Authorization header parser
    ├── schemas/
    │   └── analyze.response.ts        Response Zod doğrulaması
    └── routes/
        ├── analyze.ts                 POST /v1/analyze
        ├── batch.ts                   POST /v1/analyze/batch + stream
        ├── health.ts                  GET /health, /health/ready
        ├── mcp.ts                     GET/POST /mcp/*
        ├── audit.ts                   GET /v1/audit/*
        └── replay.ts                 POST /v1/replay

packages/
├── wallet-adapter/                    Wallet entegrasyon SDK
│   └── src/
│       ├── index.ts                   Export'lar
│       ├── types.ts                   AnalyzeResult, AnalyzeRequest vb.
│       ├── client.ts                  DeltaGClient sınıfı
│       └── interceptor.ts            signTransaction interceptor
│
└── browser-extension/                 Chrome extension
    ├── manifest.json                  Extension tanımı
    └── src/
        ├── content.js                 Sayfa enjeksiyon + mesaj köprüsü
        ├── background.js             Service worker (API iletişimi)
        ├── popup.html                Ayarlar arayüzü
        └── popup.js                  Ayarlar mantığı
```

---

Bu doküman DeltaG projesinin her parçasını, her algoritmasını, her veri akışını kapsamaktadır. Herhangi bir bölümde daha fazla detay gerekirse sorabilirsiniz.
