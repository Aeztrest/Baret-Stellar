# Baret: Proje Özeti

Bu doküman projeyi **kod bilmeden** anlatır. Teknik harita için [`ARCHITECTURE.md`](./ARCHITECTURE.md), neyin gerçekten çalıştığı için
[`docs/implementation-status.md`](./docs/implementation-status.md). Son doğrulama: 2026-09-19.

---

## Tek cümlede

Baret, Stellar'da bir işlemi **imzalamadan önce** okuyup ne yaptığını anlatan ve tehlikeliyse durduran bir cüzdan + güvenlik altyapısıdır.
Ek olarak, yapay zekâ agent'larının otomatik yaptığı küçük ödemelere (x402) harcama tavanı koyar.

**Durum:** hackathon aşaması, **Stellar testnet** (gerçek para yok). Tarayıcı eklentisi henüz mağazada değil, elle yükleniyor.

---

## Problem ne?

Bugün çoğu cüzdan, bir site "Onayla" dediğinde ne olduğunu göstermeden imzalatır. Kullanıcı yalnızca bir adres ve bir düğme görür:

- **Kör imza:** "Swap" yazan düğme aslında hesabındaki tüm bakiyeyi başkasına gönderen bir işlemi imzalatabilir.
- **Sınırsız onay:** Bir siteye "harcama yetkisi" verirsin, süresiz ve sınırsız. Aylar sonra o site hacklenir, yetki hâlâ durur.
- **Kontrolsüz agent:** Bir AI agent gün boyu küçük ödemeleri kendi başına imzalar (x402). Toplamda ne harcandığını gösteren, "şu kadarını geçme" diyebileceğin bir şey yoktur.

Baret bu üç boşluğu kapatır.

---

## Baret ne yapıyor?

**1. İşlemi imzadan önce okur.** İşlemi çözer, gerçek ağda "ne olurdu" diye simüle eder (göndermeden), risk kontrollerinden geçirir ve kararı düz bir cümleyle söyler:
**Güvenli / Dikkat / Engellendi**. Engellenen bir işlemi imzalamak için bilerek, basılı tutmak gerekir; yanlışlıkla tıklayarak geçilemez.

**2. Her yetkinin bir defteri vardır.** Bir siteye/agent'a verdiğin her ödeme yetkisi bir satırdır: ne kadar, ne zamana kadar, şimdiye kadar ne harcandı. Tek dokunuşla duraklatır ya da iptal edersin.

**3. Agent ödemelerinde tavan hem cüzdanda hem zincirde uygulanır.** Bir siteye ilk kez ödeme yapılırken sen elle onaylarsın. Sonraki küçük ödemeler, koyduğun tavan içinde, sormadan geçer.
Ayrıca o site için cüzdanına **yalnızca o siteye ve o tavana bağlı** özel bir anahtar eklenir; bu anahtar çalınsa bile saldırgan yalnızca o sitenin tavanını boşaltabilir, cüzdanı değil.

---

## Parçalar

| Parça | Kim için | Ne |
|---|---|---|
| **Tarayıcı cüzdanı** (`apps/extension`) | Kullanıcı | Chrome/Firefox eklentisi. Asıl ürün: anahtarlar burada, her imza burada kontrol edilir |
| **Analiz sunucusu / API** (`apps/server`) | Cüzdanlar, geliştiriciler | Bir işlemi alıp kararı döndüren servis. Ücretsiz anahtarla herkes kullanabilir |
| **Showcase sitesi** (`apps/showcase`) | Herkes | Gerçek testnet işlemleriyle çalışan 7 demo site (bir swap sitesi, NFT, staking, airdrop, launchpad, iki x402 sitesi) + geliştirici portalı |
| **Agent SDK ve `baret` komutu** (`packages/agent-guard`) | Bot/agent yazanlar | Agent'ın imzalamadan önce Baret'e sormasını sağlar; tehlikeliyse imzalamaz |
| **Akıllı kontrat** (`contracts/`) | Zincir | `MerchantSpendPolicy`: "bu anahtar yalnızca bu siteye, şu kadar harcayabilir" kuralını zincirde zorlar |
| **Bağımsız web cüzdanı** (`apps/wallet`) | Eklenti kuramayanlar | Sade bir web cüzdanı (akıllı cüzdan kısmı henüz yer tutucu) |
| **API doküman sitesi** (`baret_docs`) | Dış geliştiriciler | API'nin nasıl kullanılacağını anlatan site |

---

## Bir işlemin yolculuğu

1. Bir site cüzdana "şu işlemi imzala" der.
2. Cüzdan işlemi Baret sunucusuna yollar (imzalamadan!).
3. Sunucu işlemi çözer, ağdan ilgili hesapların durumunu alır, Soroban işlemlerini deneme çalıştırmasından (preflight) geçirir.
4. Neyin değişeceğini hesaplar: hangi bakiye ne kadar azalır/artar, yeni bir yetki mi veriliyor, hesabın kontrolü mü devrediliyor.
5. Risk kontrolleri çalışır (aşağıda) ve senin ayarlarına göre karar verilir.
6. Cüzdan sana kararı, neyin değişeceğini ve nedenlerini gösterir. Sen imzalarsın ya da reddedersin.

Her şey imzadan **önce** olur. Sunucuya ulaşılamazsa cüzdan bunu açıkça söyler ("korumasız imza"); sessizce izin vermez.

---

## Neleri yakalıyor?

| Tehlike | Örnek | Sonuç |
|---|---|---|
| Sınırsız harcama yetkisi | "Swap" düğmesi gizlice sınırsız token onayı verir | Engellenir (ayara göre) |
| Hesap devri/kapatma | İşlem hesabın tüm XLM'ini bir adrese taşıyıp hesabı kapatır (`AccountMerge`) | Engellenir |
| Yetki değişimi | Hesaba yabancı bir imzacı eklenir ya da kendi anahtarın devre dışı bırakılır | Engellenir |
| Sınırsız trustline | Tanımadığın bir yayıncının varlığına sınırsız güven satırı açılır | Engellenir |
| Büyük kayıp | Bakiyenin belirlediğin yüzdesinden fazlası gidiyor | Engellenir |
| Başarısız simülasyon | İşlem zaten çalışmayacak | Engellenir |
| Bilinen kötü adres/kontrat, çok derin çağrı zinciri, aşırı ücret | - | Uyarı (ayara bağlı) |
| Agent'ın tavanı aşması, sahte fiyat, benzer görünen sahte token | x402 ödemesi | Cüzdan reddeder ya da sorar |

Her tespit bir "bulgu"dur (şu an 26 farklı kod üretilir, 6 kod daha ileride kullanılmak üzere ayrılmıştır). Bir bulgunun işlemi **engellemesi** için ilgili ayarın açık olması gerekir; ayar kapalıysa yalnızca bilgi verir.

---

## Karar nasıl veriliyor? (ayar şablonları)

Kurallar bir "policy" (politika) nesnesidir. Hazır üç şablon:

- **Strict (Katı):** şüpheli her şeyi engeller. x402 ödemelerinin hepsini sana sorar.
- **Balanced (Dengeli), varsayılan:** para kaybettiren şeyleri, sınırsız yetkileri ve hesap ele geçirmeyi engeller; bilinmeyen kontratlara izin verir. Onayladığın sitelere tavan içinde otomatik ödeme yapar.
- **Permissive (Esnek):** yalnızca ölümcül sonuçları engeller.

Kuralları eklentideki Policies sayfasından açıp kapatabilir ya da JSON olarak düzenleyebilirsin.
Not: policy'deki bazı alanlar (ör. "tutar anomalisi") arayüzde durur ama henüz uygulanmaz; liste [`docs/policy-dsl.md`](./docs/policy-dsl.md)'de.

---

## x402 nedir, Baret nasıl koruyor?

**x402**, bir web servisinin "bu cevap için ödeme gerekli" (HTTP 402) demesi ve istemcinin küçük bir ödemeyle cevap vermesi protokolüdür. AI agent'lar API'leri böyle kullanır.
Protokol bilerek "hafızasızdır": kaç kez ödendiğini, ne kadar harcandığını, iptal etmeyi bilmez. Baret bu hafızayı cüzdana ekler:

1. Site 402 der. Cüzdan isteği doğrular (ağ, token, alıcı) ve kendi listelerinle karşılaştırır.
2. İlk kez ödenen site için sana **onay penceresi** çıkar: tavanlar, süre ve **gerçekte imzalanan tutar** (sitenin ekranda yazdığı değil, imzanın içinden okunan).
3. Onaylarsan o site için bir **yetki (mandate)** açılır. Süresi dolana kadar tavan içindeki ödemeler sormadan geçer ve bildirim gelir.
4. Aşan ödeme, farklı bir token, engellediğin site: reddedilir ya da sana sorulur.
5. İlk onayda zincirde **siteye özel anahtar** kurulur (yukarıdaki 3. madde). Yetki süresi dolarsa yeniden onay gerekir.

Ayrıntılı ve dürüst durum: [`docs/x402-defense.md`](./docs/x402-defense.md).

---

## Neler çalışıyor, neler eksik? (özet)

**Çalışıyor:** analiz sunucusu (dedektörler + policy), batch/stream, API anahtarları ve geliştirici portalı, x402 ödeme kapısı ve demo satıcıları, MCP araçları, tarayıcı cüzdanı
(şifreli anahtar, çoklu hesap, gerçek akıllı cüzdan, imza öncesi analiz, x402 yetkileri, drift uyarısı), agent SDK/CLI, showcase (7 site), `MerchantSpendPolicy` kontratı (testnet).

**Eksik / kısmi:** kalıcı audit (yalnız bellek), tarihsel replay (Stellar sunmuyor), eklentinin analiz cevabının imzasını doğrulaması, bazı policy alanları, `apps/wallet`'ta gerçek akıllı cüzdan, mağaza yayını, pubnet.
Bilinen bir hata: x402 yetkisi süresi dolup **yeniden onaylandığında** zincirdeki anahtar yenilenmiyor ([`docs/implementation-status.md`](./docs/implementation-status.md) §4).
Tam liste: [`docs/implementation-status.md`](./docs/implementation-status.md) ve [`LIMITATIONS.md`](./LIMITATIONS.md).

---

## Çalıştırma (geliştirici)

```bash
pnpm install
cp apps/server/.env.example apps/server/.env      # testnet için hazır gelir
pnpm dev:server        # API      → http://localhost:8080
pnpm dev:showcase      # Showcase → http://localhost:5175
pnpm build:extension   # Eklenti  → apps/extension/dist (tarayıcıya "Load unpacked")
pnpm --filter @stellar-thorn/server x402-setup    # x402 demoları için (bir kez)
```

Canlı: sunucu **Render**'da, showcase **Vercel**'de. Ayrıntı: [`DEPLOY.md`](./DEPLOY.md).

---

## Sözlük

| Terim | Anlamı |
|---|---|
| **XDR** | Stellar işleminin ikili biçimi (base64 metin olarak taşınır). Baret'e gönderilen şey budur |
| **Soroban** | Stellar'ın akıllı kontrat platformu |
| **Preflight / simülasyon** | Bir işlemi göndermeden, gerçek ağ durumuyla "deneme" çalıştırma |
| **Trustline** | Bir hesabın belli bir varlığı tutmayı kabul ettiği kayıt (bir tür güven satırı) |
| **Allowance / approve** | Bir başkasına belli miktar harcama yetkisi verme |
| **SAC** | Stellar Asset Contract: klasik bir varlığın (ör. USDC) Soroban'daki karşılığı |
| **x402** | HTTP 402 tabanlı mikro ödeme protokolü |
| **Facilitator** | x402'de ödemeyi doğrulayan ve ağa gönderen, ücreti üstlenen servis |
| **Mandate** | Bir siteye, tavan ve süreyle, senin elle verdiğin harcama yetkisi |
| **Sub-key (alt anahtar)** | Cüzdana eklenen, yalnızca tek siteye/tek tavana bağlı ikincil imza anahtarı |
| **Policy** | Baret'in senin için uyguladığı kurallar bütünü |
| **Fail-closed** | Emin olunamıyorsa izin verme, engelle |
