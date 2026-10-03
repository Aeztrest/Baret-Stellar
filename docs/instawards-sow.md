# Instawards SOW: kapsam, değişiklikler ve ilerleme

> Stellar Türkiye Instawards SOW'unun (gönderim 2026-07-21, önerilen başlangıç 2026-09-25, chapter lead İrem Koçi) kodla karşılaştırılmış takibi.
> Kaynak SOW: kullanıcıdaki "2026.06._Instawards SOW - Ezgin's Project.pdf" (repoda değil; kökteki `.docx` boş şablondur).
> Son güncelleme: 2026-10-02.

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

**Durum: 🟡 kod ve testnet provası tamam, mainnet deploy'u bekliyor** (sahibin mainnet anahtarı ve onayı gerekir).

Yapılanlar (2026-10-02, dal `feat/mainnet-spend-policy`):

- **Kontrat v2 sertleştirmesi** (`src/lib.rs`, 20 test):
  - Harcama kaydı artık sınırlı: aynı 15 dakikalık dilimdeki ödemeler tek kayıtta birleşir, 24 saatte en fazla 97 kayıt olur. Eskiden sık ödenen bir merchant'ın kaydı sınırsız büyüyordu; test, düzeltme olmadan 1.800 mikro ödemede bitmiyor.
  - `revoke` kalıcı oldu: iptal edilmiş yetkiyi `resume` geri açamaz (`#11 Revoked`); yalnız yeni bir `set_allowance` açar.
  - Yetki süresi 0 olamaz ve 365 günü aşamaz (`#12 InvalidMandate`).
  - Ödeme ve durum değişikliği event'leri (`Spent`, `StatusChanged`) eklendi.
  - Hata enum'u `PolicyError` oldu; vendored arayüzle ad çakışması TypeScript bağlama üretimini engelliyordu.
- **Agent tarafı araçları:** `packages/agent-guard/src/spend-policy.ts` (kütüphane) ve `packages/agent-guard/scripts/spend-policy.ts` (komut satırı). Gizli anahtarlar yalnız ortam değişkeninden okunur.
- **Testnet provası:** kontrat `CATKKYWT…7DZLTOBLD`. Cüzdan kurulumu, policy, limit, agent anahtarı; ardından agent'ın yalnız kendi anahtarıyla tavan içi ödemesi geçti. Tavan aşımı (`#5`), durdurulmuş hâl (`#4`), 24 saat tavanı (`#6`) ve iptal sonrası `resume` (`#11`) zincirde reddedildi. İşlem linkleri: `contracts/contracts/merchant-spend-policy/DEPLOYMENT.md` "v2 and agent wallets".
- **Mainnet hazırlığı doğrulandı:** passkey-kit akıllı cüzdan wasm'ı mainnet'te kurulu; Circle USDC'nin mainnet asset kontratı `CCW67TSZ…SJMI75` (ihraççı home domain `circle.com`). Mainnet ve testnet aynı protokol sürümünde (29).

Kalanlar:

1. Sahip, mainnet'te XLM'li bir anahtar oluşturur (`stellar keys`); agent ve test merchant hesapları da açılır. Merchant'ın USDC trustline'ı olmalı.
2. Kontrat mainnet'e deploy edilir, `spend-policy setup` ile cüzdan, policy ve merchant yetkisi kurulur, `pause`/`resume` mainnet'te bir kez denenir.
3. Kanıt: stellar.expert kontrat linki ve ekran görüntüsü (SOW 6.1).

## Deliverable 2: npm paketi

**Durum: ⏳.** Bilinen engel: passkey-kit'in bağımlısı `sac-sdk` derlenmemiş TypeScript dağıtıyor; paket düz Node'da çalışsın diye yayından önce derlemede içine gömülmeli (bundling).
Ayrıca `swig-guard` workspace bağımlılığı ya birlikte yayımlanmalı ya da gömülmeli. npm kapsamı (scope) kesinleşmeli.

## Deliverable 3: uçtan uca mainnet ödemesi

**Durum: ⏳.** Akış testnet'te çalışıyor (`spend-policy prove`). Mainnet'te tek bir tavan içi ödeme yapılır; tx hash'i, stellar.expert linki ve bir sayfalık açıklama hazırlanır.

## Sahipten gerekenler

- Mainnet'te birkaç XLM'li sahip anahtarı (deploy ve kira ücretleri) ve agent hesabı için birkaç XLM (agent kendi ücretini öder).
- Kanıt ödemeleri için birkaç dolarlık USDC.
- npm hesabı ve kapsam kararı.
- Mainnet'e giden her adım için açık onay.
