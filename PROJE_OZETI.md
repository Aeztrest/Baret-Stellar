# BLACKTHORN / DeltaG — Proje Özeti

Bu doküman projedeki her şeyi, her fikri ve her parçayı sade bir dille anlatır. Kod bilmek gerekmez.

---

## Tek Cümlede Ne Bu?

Stellar'da bir işlem imzalanmadan önce otomatik olarak kontrol eden, "bu güvenli mi yoksa tehlikeli mi?" sorusuna gerekçeli cevap veren bir güvenlik altyapısı.

---

## Problem Ne?

Stellar'da bir kullanıcı bir siteye girdiğinde "Approve" butonuna basar. Ama:

- Arka planda ne olduğunu göremez
- Hangi programlar çağrılıyor bilinmez
- Token'larının başka birine yetki verilip verilmediği anlaşılmaz
- Sahte site olup olmadığı anlaşılmaz

Sonuç: Wallet drainer, rug pull, phishing saldırıları her gün insanları mağdur ediyor.

---

## Çözüm Nasıl Çalışıyor?

```
Kullanıcı imzalamak üzere  →  Blackthorn devreye girer
                               ↓
                        İşlemi simüle eder
                        (gerçekten göndermeden)
                               ↓
                    7 risk dedektörü çalıştırır
                               ↓
                     Policy kurallarını değerlendirir
                               ↓
                   "Güvenli" veya "Tehlikeli" + gerekçe
```

Her şey imza atılmadan önce olur. Tehlikeli çıkarsa işlem bloklanır.

---

## Proje Yapısı — Ne Var Ne Yok?

Proje bir "monorepo" olarak düzenlenmiş. Yani birden fazla uygulama tek bir klasörde yan yana duruyor.

```
BLACKTHORN/
│
├── apps/
│   ├── server/          ← Ana API motoru. Her şeyin kalbi burası.
│   ├── dashboard/       ← Yönetim paneli (Next.js). İstatistik, audit, risk görünümü.
│   ├── web/             ← Demo arayüz (React). DeltaG UI adıyla geçiyor.
│   └── protocol-ts/     ← Protokol dokümantasyon sitesi (MDX formatında).
│
├── packages/
│   ├── wallet-adapter/  ← Wallet geliştiricileri için hazır SDK.
│   └── browser-extension/ ← Chrome eklentisi. Her sitede otomatik devreye giriyor.
│
├── blackthorn_testlab/  ← Aktif test ortamı. Adım adım API test arayüzü. (port 3200)
├── blackthorn_docs/     ← Dokümantasyon sitesi.
├── deltag-testlab/      ← Eski test ortamı. Artık kullanılmıyor (deprecated).
└── stitch_extract/      ← Tasarım mockup'ları ve design system dokümanı.
```

---

## Ana Motor — Nasıl Çalışıyor?

### Adım Adım Bir İşlemin Yolculuğu

1. **İstek gelir:** Kullanıcının imzalamak üzere olduğu işlem, base64 formatında API'ye gönderilir.
2. **Decode edilir:** Binary formata çevrilir, içi okunabilir hale gelir.
3. **ALT çözülür:** Bazı modern Stellar işlemlerinde adresler "Lookup Table" içinde saklanır. Bunlar RPC'den çekilerek tamamlanır.
4. **Hesap durumları alınır:** İşlemdeki tüm hesapların mevcut bakiyeleri RPC'den çekilir.
5. **Simülasyon çalışır:** "Bu işlem gerçek olsaydı ne olurdu?" sorusu Stellar RPC'ye sorulur. İmza gerekmez.
6. **Bakiye değişimleri hesaplanır:** XLM ve token değişimleri simülasyon öncesi/sonrası karşılaştırılarak bulunur.
7. **CPI ağacı çıkarılır:** Hangi program hangi programı çağırdı? Tüm zincir görünür hale gelir.
8. **İşlem anlamlandırılır:** "Bu bir Jupiter swap'i", "Bu bir token transferi" gibi insan dilinde özet üretilir.
9. **7 risk dedektörü çalışır.**
10. **Policy motoru karar verir:** Güvenli mi, değil mi?
11. **Öneri motoru çalışır:** "Bunu şöyle yapsan daha iyi olur" önerileri eklenir.
12. **Audit kaydı tutulur:** Her analiz sonucu istatistikler için saklanır.
13. **Yanıt döner:** `safe: true/false` + nedenler + bulgular + bakiye değişimleri.

---

## 7 Risk Dedektörü

Her biri bağımsız çalışır ve kendi bulgularını üretir.

### 1. Simülasyon Dedektörü
Simülasyon zaten başarısızsa işlem gerçekte de çalışmaz. En basit ama en önemli kontrol.

### 2. Program Dedektörü
- **Tehlikeli liste kontrolü:** Önceden işaretlenmiş kötü programlar çağrılıyor mu?
- **Bilinmeyen program kontrolü:** Güvenli listede olmayan bir program çağrılıyorsa kullanıcı uyarılır.

### 3. CPI Dedektörü
CPI (Cross-Program Invocation), bir programın başka bir programı çağırması. Örneğin bir swap aggregatörü arka planda 5 farklı program çağırabilir. Bu dedektör:
- CPI derinliği 4'ü geçerse uyarır
- CPI zincirinin içinde gizli tehlikeli program varsa yakalar (görünür olmasa bile)

### 4. Reputation Dedektörü
Bilinen kötü aktörlerin veritabanı. Drainer programları, phishing adresleri, exploit edilmiş programlar. İşlemdeki herhangi bir adres bu listede varsa bulgu üretilir.

### 5. Compute Dedektörü
Bir işlem çok fazla hesaplama gücü kullanıyorsa (1.2 milyon compute unit üzeri), bu bir exploit işareti veya network sorununa yol açacak bir durum olabilir.

### 6. Delta Dedektörü
- **Approval/Delegate tespiti:** Token'larınızı başkasının harcamasına izin veriliyorsa (sınırsız approve), yüksek riskli bulgu üretir.
- **Eksik veri kontrolü:** Analiz için yeterli bilgi yoksa güven seviyesi düşürülür.

### 7. Token-2022 Dedektörü
Stellar'nın yeni token standardı (Token-2022), tehlikeli ekler içerebilir:
- **TransferHook:** Her token transferinde özel kod çalıştırır. Kötü niyetli olursa token'ı geri çalabilir.
- **PermanentDelegate:** Token sahibi olmadan token'ları hareket ettirebilen kalıcı yetkili.

---

## Policy Motoru — Karar Nasıl Verilir?

Risk dedektörleri bulguları topladıktan sonra policy motoru devreye girer. Bu motor konfigüre edilebilir.

### Temel Kurallar (Boolean)

| Kural | Ne Yapar |
|-------|----------|
| `blockRiskyPrograms` | Tehlikeli listedeki program çağrılıyorsa blokla |
| `blockApprovalChanges` | Token approve değişikliği varsa blokla |
| `blockDelegateChanges` | Token delegate değişikliği varsa blokla |
| `blockUnknownProgramExposure` | Bilinmeyen program varsa blokla |
| `maxLossPercent` | XLM kaybı bu yüzdeyi aşarsa blokla |
| `minPostUsdcBalance` | İşlem sonrası USDC bakiyesi bu miktarın altına düşerse blokla |
| `requireSuccessfulSimulation` | Simülasyon başarısız olursa blokla |

### DSL Kural Dili

Daha gelişmiş senaryolar için bir kural dili var. Örnek:

```
Eğer: simulation.status = "failed"
Aksiyon: block
Sebep: "Simulation did not succeed"
Öncelik: 100
```

Desteklenen operatörler: `eq`, `neq`, `gt`, `lt`, `in`, `contains`, `exists` ve daha fazlası.

### Hazır Profiller

- **Strict (Katı):** Simülasyon başarısızsa veya herhangi bir yüksek risk varsa blokla.
- **DeFi Permissive (Esnek):** Sadece bilinen kötü aktörler varsa blokla; XLM kaybı %50'yi aşarsa uyar.
- **Monitor Only (Sadece İzle):** Hiçbir zaman bloklamaz, her şeyi raporlar.

---

## Showcase — 5 Demo Senaryo

`apps/showcase` klasöründe 5 ayrı "sahte site" var. Her biri gerçek bir Stellar tehdit senaryosunu canlandırıyor. Bunları açıp Blackthorn'un tehdidi nasıl yakaladığını görebilirsin.

| Site | Senaryo | Blackthorn Ne Yakalar? |
|------|---------|----------------------|
| **SolSwap** | Token swap | Fund drain, bilinmeyen program |
| **PixelDrop** | NFT mint | Wallet drainer, token authority çalınması |
| **SolYield** | Liquid staking | Doğrulanmamış havuz, unstake yolu yok |
| **ClaimHub** | Airdrop claim | Phishing, sınırsız token approval |
| **LaunchPad** | Token launch | Rug pull, mint authority, LP lock yok |

---

## TestLab — Adım Adım Test Ortamı

`blackthorn_testlab/` aktif test ortamıdır (port 3200). Yazılım bilmeden bile kullanılabilir.

10 adımlık akış:

1. **Ortam kontrolü** — API sağlıklı mı?
2. **Swig Wallet** — Smart wallet bağlantısı ve policy kurulumu
3. **Senaryo üret** — Test için gerçek bir Stellar işlemi hazırla
4. **Analyze** — Ana karar motoru çalıştır, sonucu gör
5. **Batch** — Birden fazla işlemi aynı anda test et
6. **SSE Stream** — Sonuçları canlı event akışı olarak izle
7. **Replay** — Aynı işlemi farklı bir slot'ta yeniden simüle et
8. **Audit** — Geçmiş analizleri ve istatistikleri gör
9. **MCP** — AI agent araç testleri
10. **x402** — Ödeme kapısı testi

---

## Wallet Adapter SDK

Wallet geliştiricileri için hazır bir entegrasyon paketi.

**DeltaGClient:** Doğrudan API çağrısı yapmak için.

**createDeltaGInterceptor:** Wallet'ın `signTransaction` fonksiyonunu sarmalar. Kullanıcı imzalamak istediğinde otomatik olarak Blackthorn analizi çalışır:
- Güvenliyse: imzalama devam eder
- Tehlikeliyse: `TransactionBlockedError` fırlatılır ya da callback çağrılır
- API çalışmazsa: fail-open (bloklamaz, sadece geçer)

---

## Browser Extension (Chrome Eklentisi)

`packages/browser-extension/` — Herhangi bir Stellar dApp'inde çalışır. Kurulumdan sonra:

- Phantom, Backpack, Solflare gibi wallet'ların `signTransaction` fonksiyonunu otomatik olarak sarar
- Kullanıcı herhangi bir sitede imzalamak istediğinde Blackthorn devreye girer
- Ayarlar popup'ından API endpoint, API key ve auto-block toggle'ı var

**Nasıl çalışır (teknik olmayan açıklama):** Eklenti, tarayıcıdaki her sayfada gizlice bekler. Wallet eklentisi yüklendiğinde ona "imzalamadan önce bana sor" der. Blackthorn'dan onay gelirse imzalama devam eder, gelmezse durur.

---

## MCP Server — AI Agent Entegrasyonu

MCP (Model Context Protocol), yapay zeka agentlarının araç olarak kullanabileceği bir standart protokol.

Blackthorn bu protokolü destekliyor. Bir AI agent şöyle çağırabilir:

```
"Bu transaction güvenli mi?"
→ deltag_analyze({ transactionBase64: "...", cluster: "mainnet-beta" })
→ Sonuç: markdown formatında güvenlik raporu
```

Üç araç var:
- `deltag_analyze` — işlem analiz et
- `deltag_health` — servis sağlıklı mı?
- `deltag_list_profiles` — policy profilleri listele

---

## x402 Ödeme Sistemi

HTTP 402 "Payment Required" protokolü üzerine kurulu mikro ödeme sistemi.

**Akış:**
1. API key olmadan istek gelir
2. Sunucu "402 — Ödeme gerekli" döner
3. Kullanıcı Stellar üzerinden ödeme yapar (USDC cinsinden, istek başı ~$0.001)
4. PayAI facilitator ödemeyi doğrular
5. Analiz çalışır
6. Analiz başarılıysa ödeme kesinleştirilir

Başarısız analiz için para çekilmez.

---

## Dashboard

`apps/dashboard/` — Next.js tabanlı yönetim paneli.

4 bölüm var:
- **Overview:** Sağlık durumu, toplam analiz sayısı, safe oranı
- **Audit:** Son analiz kayıtları tablosu
- **Risk:** Risk analytics görünümü
- **Area chart:** Zaman bazlı analiz grafiği

Canlı API bağlantısıyla çalışır; her yenileme backend'den veri çeker.

---

## Tasarım Sistemi — The Sentinel Protocol

`stitch_extract/stitch/deltag_sentinel/DESIGN.md` dosyasında detaylı bir tasarım sistemi var.

**Felsefe: "Cyber-Tactile Intelligence"**

- Ekran düz bir tuval değil, verinin içine baktığın bir terminal gibi
- Koyu lacivert arka plan (`#060e20`), elektrik mavisi vurgular
- Çizgi yok — sınırlar renk geçişiyle tanımlanır
- Güvenli = cyan ışıma, Riskli = mavi-çelik, Tehlikeli = kırmızı
- Space Grotesk (başlıklar) + Inter (metin) font ikilisi
- Asimetrik layoutlar (dar sidebar + geniş içerik alanı)

---

## Audit Trail

Her analiz sonucu otomatik kaydedilir:
- Kim sordu (wallet adresi, opsiyonel)
- Hangi cluster
- Karar: safe mi değil mi?
- Hangi risk kodları çıktı
- Hangi programlar çağrıldı
- Ne kadar sürdü

Son 10.000 kayıt bellekte tutulur. Şu an persistent storage (veritabanı) yok — sunucu yeniden başlatılırsa sıfırlanır.

---

## Sınırlılıklar — Neyi Garantilemiyor?

- Simülasyon gerçek yürütmeyi garantilemez. Network koşulları, blockhash süresi dolması, priority fee farklılıkları sonucu değiştirebilir.
- Sadece Transaction formatı destekleniyor (legacy format desteklenmiyor).
- En fazla 64 hesap simülasyona dahil ediliyor. Daha fazlası varsa analiz eksik kalabilir ve güven seviyesi düşürülür.
- Bilinmeyen veya yeni program davranışları tespit edilemeyebilir.
- x402 ödemesi doğrulandıktan sonra ama analiz başarısız olursa ödeme kesinleştirilmez ama verified durumda kalır.

---

## API — Uç Nokta Özeti

| Yöntem | Adres | Ne Yapar |
|--------|-------|----------|
| GET | `/health` | Sunucu ayakta mı? |
| GET | `/health/ready` | RPC ve bağımlılıklar hazır mı? |
| POST | `/v1/analyze` | Tek işlem analizi |
| POST | `/v1/analyze/batch` | Toplu analiz (max 25 işlem) |
| POST | `/v1/analyze/stream` | Canlı sonuç akışı (SSE) |
| POST | `/v1/replay` | Belirli bir slot'ta simülasyon |
| GET | `/v1/audit/recent` | Son analiz kayıtları |
| GET | `/v1/audit/aggregate` | Toplam istatistikler |
| GET | `/v1/audit/program/:id` | Program bazlı audit |
| GET | `/mcp/tools` | AI agent araç listesi |
| POST | `/mcp/call` | AI agent araç çağrısı |

---

## Ortam Değişkenleri — Kritikler

| Değişken | Ne İşe Yarar |
|----------|-------------|
| `RPC_MAINNET_BETA` | Mainnet RPC adresi |
| `RPC_DEVNET` | Devnet RPC adresi |
| `DELTAG_API_KEYS` | API erişim anahtarları (virgülle ayrılmış) |
| `RISKY_PROGRAM_IDS` | Tehlikeli program adresleri |
| `KNOWN_SAFE_PROGRAM_IDS` | Güvenli program adresleri |
| `X402_ENABLED` | x402 ödeme kapısı açık mı? |
| `X402_PAY_TO` | Ödemelerin gideceği Stellar adresi |

---

## Docker ile Çalıştırma

```bash
docker compose up --build -d
```

| Servis | Port |
|--------|------|
| API | 18080 |
| Web UI | 5173 |
| TestLab | 3200 |

---

## Yerel Geliştirme

```bash
pnpm install
pnpm dev           # API → :8080
pnpm dev:showcase  # Showcase demo siteleri → :5174
pnpm dev:web       # DeltaG UI → :5173
pnpm dev:dashboard # Yönetim paneli
pnpm dev:testlab   # TestLab → :3200
pnpm dev:all       # Hepsini paralel başlat
pnpm test          # Unit testler
```

---

## Mevcut Durum — Ne Var, Ne Eksik?

### Tamamlanmış
- Ana API motoru (tüm 7 dedektör, policy engine, DSL)
- Batch ve SSE streaming analiz
- Simulation Replay
- Audit trail (in-memory)
- Reputation database
- MCP server
- x402 ödeme entegrasyonu
- Wallet Adapter SDK
- Browser Extension (Chrome MV3)
- TestLab (10 adımlı test akışı)
- Dashboard (monitoring paneli)
- Showcase siteleri (5 adet)
- Swig smart wallet entegrasyonu
- Dokümantasyon sitesi
- Docker compose

### Eksik / Geliştirilebilir
- Audit verisi için kalıcı depolama (veritabanı — şu an sadece bellekte)
- `apps/web` (DeltaG UI) tam geliştirilmemiş görünüyor
- `apps/protocol-ts` protokol dokümantasyon sitesi içerik açısından şablon
- Reputation database genişletilmesi (şu an seed verisiyle başlıyor)
- Multi-instance deployment için shared rate limiting (şu an IP bazlı, tek sunucu için)
