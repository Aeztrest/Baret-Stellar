# Instawards SOW: kapsam, değişiklikler ve ilerleme

> Stellar Türkiye Instawards SOW'unun (gönderim 2026-07-21, önerilen başlangıç 2026-09-25, chapter lead İrem Koçi) kodla karşılaştırılmış takibi.
> Kaynak SOW: kullanıcıdaki "2026.06._Instawards SOW - Ezgin's Project.pdf" (repoda değil; kökteki `.docx` boş şablondur).
> Son güncelleme: 2026-10-07.

## Hedef (değişmedi)

30 günün sonunda bir agent, sahibi o anda imza atmadan, zincirde zorlanan bir harcama limiti içinde **mainnet'te gerçek bir ödeme** yapar.
Bunun kanıtı, herkesin stellar.expert'te açabileceği tek bir işlem hash'idir.

## SOW'dan sapmalar ve nedenleri

SOW yazıldığından beri kod ilerledi. Hedef aynı kaldı; onu gerçekleştiren parçalar güncel koda göre seçildi.

| SOW'da yazan | Güncel hâli | Neden |
|---|---|---|
| "PaymentGuard" kontratı | **MerchantSpendPolicy v2** (`contracts/contracts/merchant-spend-policy`) | PaymentGuard ürün dışı bırakıldı (`contracts/README.md`). Testnet'te çalışan ve test edilen kontrat bugün MerchantSpendPolicy; SOW'daki "aynı kontrat testnet'te zaten deploy edildi ve test edildi" cümlesi ancak bunun için doğru. |
| Kontratı "gerçek fonla initialize et" | Fon **sahibin kendi akıllı cüzdanında** durur (passkey-kit); kontratın `init`'i ve bakiyesi yoktur | Kontratta para durmadığı için kontrat hatası doğrudan fon kaybı demek değildir. Gözden geçirmede PaymentGuard'ın `pay()`'inin **imza istemediği** görüldü: herkes tavan dolana kadar kasadan merchant'a ödeme tetikleyebiliyordu. MerchantSpendPolicy'de ödemeyi yalnız merchant'a bağlı agent anahtarı yapabilir. |
| Agent `pay()` çağırır | Agent, cüzdanda yalnız tek token'a ve tek merchant'a kapsamlı **alt anahtar** olarak imza atar; cüzdan her ödemede policy'ye sorar | Agent'ın kimliği zincirde doğrulanır; sızan agent anahtarı başka merchant'a, başka token'a ya da tavan üstüne ödeme yapamaz. |
| İşlem başı tavan, kayan 24 saat tavanı, anında durdur/iptal | Aynen var | `set_allowance`, `pause`/`resume`/`revoke`; v2'de iptal kalıcı. |
| SOW bütçesindeki iki güvenlik düzeltmesi (yetkisiz `init()`, kayan olmayan günlük tavan) | MerchantSpendPolicy'de `init` yok; günlük tavan baştan beri gerçek kayan pencere | Bu iki açık PaymentGuard'a özgüydü. Bu turda MerchantSpendPolicy için yapılan sertleştirme aşağıda. |
| npm paketi `@stellar-thorn/agent-guard` | Aynı paket, `spend-policy` alt yolu eklendi | Paket adı npm'de hangi kapsam bize aitse ona göre kesinleşecek (`@stellar-thorn` kapsamının sahipliği doğrulanmadı). |

## Deliverable 1: mainnet kontratı ve harcama limitleri

**Durum: ✅ mainnet'te (2026-10-07).**

Kanıt (SOW 6.1):
- Kontrat: [`CCFFBHBKOD3NBIUMLTS5LUJ5KSPA6HCVBEO5IRFAGCLZO7HXVMDKDNOS`](https://stellar.expert/explorer/public/contract/CCFFBHBKOD3NBIUMLTS5LUJ5KSPA6HCVBEO5IRFAGCLZO7HXVMDKDNOS). Zincirdeki wasm hash'i (`cda12f8a…6e8611`) testnet'te denenen ve bu repodaki kaynaktan yeniden üretilen derlemeyle aynı.
- Limitlerin kurulu olduğu akıllı cüzdan: [`CC5RDVZPOKYVEMTWS3VBZSMGQ5QLUVZ7JZHPFVF6YUPPW7AB5FQZ2SGN`](https://stellar.expert/explorer/public/contract/CC5RDVZPOKYVEMTWS3VBZSMGQ5QLUVZ7JZHPFVF6YUPPW7AB5FQZ2SGN). Tek merchant (ekibe ait test hesabı) için işlem başı 0.5 USDC, kayan 24 saatte 2 USDC, 30 gün; agent anahtarı `GD6PYZFO…XP7SOPN7`.
- Durdur/devam ettir mainnet'te denendi: [pause](https://stellar.expert/explorer/public/tx/3f9346801dbce202aee969e43cb1c061fa5a8830dbc328152f1e0ba0fd776d5c) sonrası ödeme `#4 NotActive` ile reddedildi, [resume](https://stellar.expert/explorer/public/tx/75993dfff56ec49295537ddaffdac581471747a3d08975c1c0eba1a67138bad9) ile açıldı. `revoke` ve 24 saat tavanı mainnet'te denenmedi (testnet provasında var).
- Ekran görüntüsü: sahip tarafından alınacak.
- Tek satırlık not (SOW): "This is the smart contract that enforces Baret's spending limits, now running with real money."

Yapılanlar (2026-10-02, dal `feat/mainnet-spend-policy`):

- **Kontrat v2 sertleştirmesi** (`src/lib.rs`, 20 test):
  - Harcama kaydı artık sınırlı: aynı 15 dakikalık dilimdeki ödemeler tek kayıtta birleşir, 24 saatte en fazla 97 kayıt olur. Eskiden sık ödenen bir merchant'ın kaydı sınırsız büyüyordu; test, düzeltme olmadan 1.800 mikro ödemede bitmiyor.
  - `revoke` kalıcı oldu: iptal edilmiş yetkiyi `resume` geri açamaz (`#11 Revoked`); yalnız yeni bir `set_allowance` açar.
  - Yetki süresi 0 olamaz ve 365 günü aşamaz (`#12 InvalidMandate`).
  - Ödeme ve durum değişikliği event'leri (`Spent`, `StatusChanged`) eklendi.
  - Hata enum'u `PolicyError` oldu; vendored arayüzle ad çakışması TypeScript bağlama üretimini engelliyordu.
- **Agent tarafı araçları:** `packages/agent-guard/src/spend-policy.ts` (kütüphane) ve `packages/agent-guard/scripts/spend-policy.ts` (komut satırı). Gizli anahtarlar yalnız ortam değişkeninden okunur.
- **Testnet provası:** kontrat `CCL7DJY2…S7MPNH` (2026-10-03, optimize edilmiş 11.4 KB sürüm; ilk prova 18 KB sürümle 2026-10-02). Cüzdan kurulumu, policy, limit, agent anahtarı; ardından agent'ın yalnız kendi anahtarıyla tavan içi ödemesi geçti. Tavan aşımı (`#5`), durdurulmuş hâl (`#4`), 24 saat tavanı (`#6`) ve iptal sonrası `resume` (`#11`) zincirde reddedildi. İşlem linkleri: `contracts/contracts/merchant-spend-policy/DEPLOYMENT.md` "v2 and agent wallets".
- **Mainnet hazırlığı doğrulandı:** passkey-kit akıllı cüzdan wasm'ı mainnet'te kurulu; Circle USDC'nin mainnet asset kontratı `CCW67TSZ…SJMI75` (ihraççı home domain `circle.com`). Mainnet ve testnet aynı protokol sürümünde (29).

- **Maliyet ölçümü (2026-10-03, mainnet simülasyonu):** kontrat kodunu mainnet'e yüklemek ~18.8 XLM; neredeyse tamamı kira, çünkü mainnet yeni kodu en az ~120 gün saklatır ve kirayı peşin alır. Kod 18 KB'tan 11.4 KB'a küçültüldü (spec'ten doküman yorumları ve kullanılmayan tipler çıkarıldı, `--optimize`); kod kirası modülün bellekteki boyutuna göre hesaplandığı ve büyük bir sabit kısmı olduğu için bu yalnız ~2.1 XLM kazandırdı. Owner için toplam ihtiyaç ~36 XLM (yükleme, kurulum, agent ve merchant hesaplarını owner'dan açma, trustline, pay).

- **Mainnet'te gerçekleşen maliyet (tahsil edilen):** kontrat yükleme 16.33 XLM, akıllı cüzdan 44.77 XLM, geri kalan her şey toplam 0.4 XLM'in altında. Cüzdan adımı öngörülmemişti: passkey-kit'in ortak cüzdan kodunun mainnet'te 46 gün ömrü kalmıştı ve cüzdan kurulurken kendi kodunu ~180 güne uzatıp kirasını kurana ödetiyor (testnet'te kod zaten en üst sınırda olduğu için provada 0.5 XLM görünmüştü). Ürün mainnet'e çıkarsa hesaba katılmalı: kod kullanılmadıkça kira birikir ve bir sonraki işlemi yapan öder.
- **Mainnet'in ortaya çıkardığı iki araç hatası (düzeltildi, para kaybı yok):** SDK'nın imzalama adımı ücret teklifini iki katına çıkarıyordu (51 yerine 103 XLM; ağ "yetersiz bakiye" diye reddetti), ve varsayılan öncelik teklifi (100 stroop) ile 30 saniyelik süre mainnet'teki sırada yetmedi (işlem ledger'a girmeden düştü). Araç artık işlemi kendisi imzalıyor, teklifi kaynak ücreti + 0.001 XLM yapıyor, bunun 0.1 XLM üstünü göndermeyi reddediyor ve `BARET_DRY_RUN=1` ile göndermeden ücret gösteriyor.
- **Süreç notu:** PR #56, kontratı küçülten commit gönderilmeden önce merge edildi; mainnet'e çıkan derlemenin kaynağı `main`'e bu kaydı taşıyan PR ile girdi.

## Deliverable 2: npm paketi

**Durum: ⏳.** Bilinen engel: passkey-kit'in bağımlısı `sac-sdk` derlenmemiş TypeScript dağıtıyor; paket düz Node'da çalışsın diye yayından önce derlemede içine gömülmeli (bundling).
Ayrıca `swig-guard` workspace bağımlılığı ya birlikte yayımlanmalı ya da gömülmeli. npm kapsamı (scope) kesinleşmeli.

## Deliverable 3: uçtan uca mainnet ödemesi

**Durum: 🟡 ödeme yapıldı (2026-10-07); SOW'un istediği "npm'den kurulan agent-guard ile" kısmı Deliverable 2'yi bekliyor.**

- İşlem: [`4d3d6490…54868d60`](https://stellar.expert/explorer/public/tx/4d3d6490ff815fd5f942e9960d93d128c396b92e649de998d0122d7554868d60) (ledger 64823727). Agent, akıllı cüzdandan merchant'a 0.1 USDC ödedi.
- Zincirden doğrulandı: işlemin kaynak hesabı agent, zarfta tek imza var ve agent'a ait (sahip anahtarı imzalamadı), işlem USDC `transfer(cüzdan → merchant, 0.1)`, bakiyeler 5 / 0 → 4.9 / 0.1 USDC. Aynı koşuda 0.5000001 USDC'lik ödeme kontrat tarafından `#5 ExceedsPerTx` ile reddedildi.
- Ödeme repodaki `agent-guard` aracıyla (`spend-policy prove`) yapıldı. Paket npm'de yayımlandıktan sonra aynı ödeme yayımlanan paketle bir kez daha yapılırsa SOW'un cümlesi birebir karşılanır.
- Kalan: bir sayfalık açıklama ya da kısa ekran kaydı (SOW 6.1).

## Sahipten gerekenler

- Deliverable 1 için stellar.expert kontrat sayfasının ekran görüntüsü.
- Deliverable 2 için npm hesabı ve kapsam (scope) kararı.
- Mainnet hesapları sahibin `stellar` CLI deposunda (`baret-owner`, `baret-agent`, `baret-merchant`); gizli anahtarlar repoda ya da herhangi bir dosyada değil. Mainnet işlemlerini sahip kendi terminalinden çalıştırır.
