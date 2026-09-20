# Baret: yol haritası ve görev planı

> **Canlı takip dosyası.** Oturumlar arası süreklilik için tek kaynak: neyin yapıldığı, neyin kaldığı, alınan kararlar ve her görevin nasıl yapılacağı.
> **Her oturumun başında oku, her iş bitince güncelle.**
> Son güncelleme: 2026-09-20 · Taban: origin/main @ 89395f5 (PR #43). Çalışma dizini: ayrı worktree BaretStellar-main (dal main), bkz. S0.

## 0. Bu dosyayı nasıl kullanırım

- Durum sözlüğü: ✅ bitti (kanıtla) · 🟡 kısmen · ⏳ yapılacak · ❓ karar/bilgi bekliyor · 🚫 bilerek yapılmayacak.
- Bir görevi ✅ yapmadan önce **Kabul** maddelerini karşıla ve **Kanıt** satırına dosya/commit/URL yaz.
- Her güncellemede en alttaki **Değişiklik günlüğü**'ne tarihli satır ekle.
- **Koda güven, bu dosyaya değil.** Bir görevin durumunu değiştirmeden önce kodu ya da canlı sistemi kontrol et; doğrulayamadığını "doğrulanmadı" diye yaz.
- [`AGENTS.md`](./AGENTS.md) kuralları geçerlidir: doküman protokolü (kod değişince ilgili dokümanı güncelle, `pnpm docs:check`), commit/PR **yalnız kullanıcı isterse**, commit mesajında araç imzası yok, başka bir oturum aynı ağaçta çalışıyor olabilir (düzenlemeden önce yeniden oku, başkasının değişikliğini ezme).
- Dil: bu dosya Türkçedir (iç işleyiş belgesi). Kod, yorum ve commit mesajı İngilizce.
- **Bu dosyada henüz var olmayan dosya yollarını backtick içinde `apps/...` biçiminde yazma:** `pnpm docs:check` var olmayan yolu hata sayar. Gelecekteki dosyaları düz metinle anlat.

## 1. Bağlam

- **Etkinlik:** Rise In × Stellar Pro Hackathon, İstanbul, 18-20 Eylül 2026. Baret **Scale Track**'te. Kullanıcı beyanı (2026-09-20): süre kısıtı yok.
- **Jüri kriterleri (6):**
  1. Fikir ve gerçek etki.
  2. Teknik: testnet'te gerçekten çalışan (mock/hardcoded değil), Soroban auth ve storage (instance/persistent/temporary) doğru kullanımı, mimari + **Scale Track için Mermaid diyagramı**. Passkey/smart wallet bonus.
  3. Ecosystem Fit: **Anchor ve yerel ödeme entegrasyonu diğer kalemlerden ağır basar**; Stellar SDK/CLI/**Skills referanslarının belgelenmesi**.
  4. UX (kripto bilmeyen kullanıcı için sezgisel).
  5. Traction ve süreklilik (gerçek kullanıcı, roadmap, SCF/InstaAwards niyeti).
  6. Sunum ve dokümantasyon (README, demo, test talimatı).
- **Jüri ile teyit edildi (kullanıcı, 2026-09-20):** gerçek bir TRY anchor **yok**; onun yerine **tr-mock-anchor** kullanılacak; **SEP-24 kullanılmayacak**.
- **tr-mock-anchor** (doğrulandı: canlı `stellar.toml` ve gerçek SEP-10/SEP-6 çağrıları, 2026-09-19):
  - Home domain `tr-mock-anchor.fly.dev`. SEP-1, SEP-6, SEP-10, SEP-12 (simüle), SEP-38. SEP-24 ve SEP-31 yok. Testnet, gerçek para hareket etmez.
  - `SIGNING_KEY = GDXYO6FJCNXZEWGXD54GT76FGFYLOLSOGSOJLNQ6WGHCGEQPO7NTE73M`. Varlık: USDC, issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`.
  - **Bu USDC'nin SAC kimliği (`CBIELTK6…MXQDAMA`), Baret'in x402'de ödediği varlıkla birebir aynıdır** (hesaplayarak doğrulandı). Hikâye: TL → anchor → USDC → x402 ajan ödemesi, hepsi Baret korumalı.
  - Akış: `GET /auth?account=G…` (challenge) → `POST /auth {transaction}` (JWT) → `GET /sep6/deposit?asset_code=USDC&account=G…&amount=…&funding_method=bank_account` (IBAN + referans) → sandbox `POST /sep6/tx/{id}/simulate-bank-transfer {amount}` → `GET /sep6/transaction?id=` (poll, `completed`). Çekme: `GET /sep6/withdraw?asset_code=USDC&type=bank_account&amount=…` → `account_id` (hazine), `memo_type` (`id`), `memo`, kilitli kur, `id`; cüzdan tam tutarı o hesaba o memo ile öder.
  - Ön koşul: `G…` hesabı XLM ile fonlu **ve** USDC trustline'ı olmalı (yoksa yatırma `pending_trust`'ta kalır). Tutar limiti yok, %0.5 spread.
  - SEP-38'in tam yolları rehberde yazmıyor; `stellar.toml` ve `https://tr-mock-anchor.fly.dev/sep` rehberinden öğrenilir. Örnek istemci: `https://github.com/kaankacar/tr-mock-wallet` (tek dosya `index.html`).
  - Bir mock'tur (fly.dev): düşebilir/sıfırlanabilir (bkz. §8 R1).

## 2. Alınan kararlar

| # | Karar | Tarih |
|---|---|---|
| D1 | TRY anchor = tr-mock-anchor; SEP-24 yok; SEP-1/10/6 (+ SEP-38 isteğe bağlı) | 2026-09-20 |
| D2 | x402 **otomatik imza** analiz sunucusu kapalıyken de devam eder (yerel politika + zincir üstü tavan korur). README'de dürüstçe yazılır | 2026-09-19 |
| D3 | Varsayılan x402 tavanı 25 USDC/gün'ün altına iner. Önerilen: işlem başına 0.5, saatte 2, günde 5 USDC (kullanıcı "25 altına düşürebilirsin" dedi; sayılar T1.6'da onaylanır) | 2026-09-19 |
| D4 | Render erişimi kullanıcıda; Render paneli ve `BARET_SIGNING_SECRET` gibi env işlemlerini kullanıcı yapar | 2026-09-19 |
| D5 | README, kaynaklar bölümü, demo ve sunucuyu ayık tutma **en sonda** (Faz F) | 2026-09-19 |
| D6 | passkey-kit **yükseltilmez** (stranded cüzdan + MerchantSpendPolicy uyumu doğrulanmadı); passkey yalnız `apps/wallet`'ta, zaman kutulu spike sonrası go/no-go | 2026-09-19 |
| D7 | Yeni bulgu kodları için tek katalog + drift testi (sunucunun workspace paketlerinden bağımsız olma kararı korunur) | 2026-09-20 |

## 3. Mimari özet

Ayrıntı: [`ARCHITECTURE.md`](./ARCHITECTURE.md) ve `docs/architecture/*`. Kısaca:

- **Aynı motor 4 yüzeyde:** MV3 tarayıcı cüzdanı (`apps/extension`, asıl ürün), HTTP analiz API'si (`apps/server`, anahtarlı; `POST /v1/keys` ile ücretsiz anahtar), agent SDK+CLI (`packages/agent-guard`), MCP araçları.
- **Sunucu güven sınırı değildir.** Eklenti karar verir; sunucuya ulaşamazsa "korumasız imza" advisory'si gösterir. x402 tavanlarını kendi IndexedDB'sinde uygular.
- **Tavan zincirde de:** `MerchantSpendPolicy` (Soroban, testnet `CCWTPB4F…SQ2DHQ5S`), passkey-kit smart wallet'a `Policy` signer olarak bağlanır; merchant başına alt anahtar. Kurulum **best-effort** ve ilk elle onaydan sonra.
- **Ödeme yapan akıllı cüzdan `C…`'dir**, kimlik/gas hesabı `G…` authority'dir (bu, anchor entegrasyonunda köprü gerektirir, bkz. T2.6).
- Sunucu kontrat/eklenti/showcase arasındaki **elle senkron aynalar** `AGENTS.md`'de listelidir (sunucu `domain/*` ↔ swig-guard tipleri, attestation, policy şeması, `PaymentRequirements`).

## 4. Taban durum (2026-09-20, `origin/main` @ `89395f5`)

| Konu | Durum | Kanıt / not |
|---|---|---|
| Sunucu canlı ve güncel | ✅ | `/health`, `/v1/meta`, `/openapi.json` 200; ilk istek 0.5 sn (uyanıktı). Canlı meta: `attestation.enabled=false`, `x402.enabled=false` |
| Herkese açık geliştirici API'si (`/v1/keys`, anahtar başı limit, CORS, OpenAPI, `/developers` portalı, agent prompt) | ✅ | PR #40, #42, #43 |
| Doküman seti yenilendi + `pnpm docs:check` (CI'da ayrı iş) | ✅ | PR #41; `docs:check OK (38 markdown, 31 env)` |
| PR #39 (Freighter x402), #21 (eski dokümanlar) | ✅ merge | |
| CI (`main`) | ✅ yeşil | son 4 koşu başarılı |
| Dockerfile filtresi, eski `openapi.yaml` kalıntısı | ✅ düzeldi | Dockerfile `@stellar-thorn/server` filtresini kullanıyor; eski `openapi.yaml` silinmiş |
| Sahte sayaçlar (Scrybe `ORACLE_STATS` "48,210", `RECENT_QUESTIONS`) | ⏳ hâlâ var | `apps/showcase/src/sites/scrybe/Scrybe.tsx` |
| Eklenti analiz timeout'u 25 sn (Render cold start ≈ 30 sn) | ⏳ | `apps/extension/src/background/baret/analyze-client.ts` |
| Attestation eklentide/showcase'te doğrulanmıyor; canlıda kapalı | ⏳ | `docs/implementation-status.md` §1 |
| Stellar SDK sürümleri | 🚫 ertelendi (T0.4) | eklenti `^16.0.1`, diğerleri `^15.1.0`; ihtiyacımız olan API iki majörde de aynı |
| SEP-1/6/10 (anchor) kodu | ⏳ hiç yok | |
| `spend_log` sınırsız `Vec` (kontrat) | ⏳ | `contracts/contracts/merchant-spend-policy/src/lib.rs` |
| Varsayılan tavan 1 / 5 / **25** USDC | ⏳ | `apps/extension/src/background/x402/handlers.ts` |
| Mandate yenileme hatası (zincir tarafı yenilenmiyor) | ⏳ bilinen hata | `docs/implementation-status.md` §4, `LIMITATIONS.md` |
| Zincir üstü alt anahtarın canlı uçtan uca doğrulaması | ⏳ yeniden koşulmadı | `contracts/contracts/merchant-spend-policy/DEPLOYMENT.md` |
| `baret_docs` (içerik güncel) deploy tanımı | ⏳ yok | `ARCHITECTURE.md` §7 |
| Mermaid diyagramı, Skills referansları, canlı demo/video linki, roadmap/SCF-InstaAwards niyeti (README) | ⏳ | Faz F |

**Doğrulanmayanlar** (görevlerde ele alınır): Render free diskinde `keys.json` kalıcılığı (dokümana göre kalıcı değil), testnet sıfırlanma sıklığı, Docker derlemesi, SW askıya alma davranışı, WebAuthn'in eklenti origin'inde çalışması, tr-mock-anchor'ın değerlendirme sonuna kadar ayakta kalması.

## 5. Her görev için ortak kurallar (tanım-tamam)

1. **Dal:** görev başına ayrı dal (`feat/…`, `fix/…`, `docs/…`). Commit/PR yalnız kullanıcı isterse; imza satırı yok.
2. **Önce test/fixture:** ayrıştırıcı ve doğrulayıcılar için hermetik birim test (ağ yok). Canlı anchor/sunucuya karşı ayrı "duman testi" yazılırsa CI'da atlanır.
3. **Sınırlarda Zod, fail-closed:** yeni güvenlik kontrolünün varsayılanı reddetmektir; veri yoksa izin verme.
4. **Doküman protokolü:** `docs/README.md` "Kod ↔ doküman" tablosundaki ilgili dokümanları güncelle; ⏳↔✅ satırını `docs/implementation-status.md`'de çevir; `pnpm docs:check` çalıştır.
5. **Doğrulama:** `pnpm typecheck` (önce `pnpm build:guard && pnpm --filter @stellar-thorn/wallet-adapter build`), ilgili paket testleri, eklenti/showcase için **tarayıcıda elle doğrulama** (otomatik UI testi yok).
6. **Kabul:** her görevde yazılı; sonuç mesajında hangi dokümanların güncellendiği söylenir.
7. **Yeni eklenti RPC'si:** önce `packages/ext-protocol/src/index.ts`, sonra `apps/extension/src/background/messaging/handlers.ts`. Gizli anahtar yalnız SW belleğinde; loglama/taşıma yok.
8. **Yeni `/v1` rotası:** `apps/server/src/api/openapi.ts` + `apps/showcase/src/pages/developers/endpoints.ts` + `baret_docs` (AGENTS.md).

## 6. Görevler

### Faz S: Çalışma ortamı ve PR hijyeni

#### S0. Çalışma dizinini senkronla ✅ (ayrı worktree)
- **Bulgu (2026-09-20):** yerel dal docs/render-x402-merchant-secret @ `349d8ab`, `origin/main`'in gerisinde; 96 commit'lenmemiş değişiklik var (64 değişmiş/silinmiş + 32 takipsiz). Karşılaştırdım: **86'sı `origin/main` ile birebir aynı** (iş zaten GitHub'da); farklı olan tek dosya `DEPLOY.md` (yerel daha eski); yalnız yerelde olan `2026.06._Instawards SOW - Ezgin's Project.docx`. Kayıp iş görünmüyor.
- **Karar (kullanıcı: "main'de kalabiliriz"):** eski ağaçta iki başka `claude` oturumu açıktı (cwd o dizin); `AGENTS.md` "Eşzamanlı çalışma" gereği o ağaçta stash/dal değişikliği **yapılmadı**. Bunun yerine `main`'i **ayrı bir git worktree**'de açtım: dizin `BaretStellar-main` (eski dizinin yanında, aynı `.git`), dal `main`, `HEAD == origin/main` (`89395f5`).
- **Sonuç:** tüm çalışma bu worktree'de yapılır; `PLAN.md` de burada. Eski ağaç (dal docs/render-x402-merchant-secret, 96 commit'lenmemiş dosya, 86'sı `origin/main` ile birebir aynı) **olduğu gibi** duruyor; kullanıcı isterse temizler. `main` dalı bu worktree'de çıkış yapılmış olduğu için eski ağaçta `git checkout main` "already checked out" verir (beklenen).
- **Kabul:** ✅ `git worktree list` iki ağacı gösterir; `git status` temiz (PLAN.md hariç); temel çizgi: `pnpm typecheck` yeşil, testler yeşil (ext-protocol 3, baret-adapter 3, swig-guard 16, server 165, agent-guard 16, wallet 16, eklenti 89).

#### S1. Bekleyen PR'lar ✅ (üçü bilerek açık)
- ✅ #39, #21, #40-#43 merge edilmişti.
- ✅ **Merge edildi (2026-09-20, kullanıcı onayıyla, merge commit, sırayla):** #22 (`soroban-sdk` 25→27.0.6), #17, #9, #8 (Actions sürümleri), #15, #14, #13 (`baret_docs`). Hepsi `MERGEABLE/CLEAN` idi, `main` korumasız. Sonrasında `main`'in son CI koşusu **başarılı** (öncekiler eşzamanlılık yüzünden iptal edildi).
- ⏳ **Bilerek açık bırakıldı (kırmızı):** **#12** (next 16.3) ve **#11** (eslint 10): Docs CI başarısız; **#24** (43 paket): Node CI + Vercel başarısız. Kapatma kararı kullanıcıda; gerekirse paket paket denenir.
- **Yan etkiler (giderildi):** (1) Dependabot Action sürümlerini yalnız o anda var olan işlerde yükseltmişti; sonradan eklenen işler `@v4`'te kaldı → hizalandı. (2) #22 sonrası `payment-guard` test anlık görüntüleri yeniden üretildi (protocol_version 25→27) → commit'lendi. (3) `check-secrets.mjs` izlenen dosya olunca kendi PEM etiketini yakaladı → düzeltildi.
- **Kanıt:** rebase sonrası kontrat komutları yeşil, wasm hash'i değişmedi (`9ba6094c…`), typecheck temiz, `docs:check`/`secrets:check` OK.

### Faz 0: Zemin

#### T0.1 Deploy hattı ✅
- Kanıt: 2026-09-20 canlı `/health` 200, `/v1/meta` 200, `/openapi.json` 200. Ek: `/health`'e commit sha eklemek isteğe bağlı (yapılmadı).
- Not: canlı `keyIssuance.persistent: true` yalnız "klasör yazılabilir" demek; Render free diski kalıcı değildir (F2'de ele alınır).

#### T0.3 Bulgu kodları için tek katalog + drift testi ✅ (D7)
- **Yapıldı (2026-09-20, commit'lenmedi):** swig-guard'da `RISK_FINDING_CODES` (sunucunun döndürdüğü kodlar; eksik olan `SET_OPTIONS_RISKY` eklendi) ve `CLIENT_FINDING_CODES` (`ANALYZE_UNREACHABLE`, `X402_ASSET_NOT_ALLOWED`) çalışma zamanı dizileri; `ServerFindingCode`/`ClientFindingCode` tipleri. `apps/server/test/domain/finding-codes.test.ts` sunucu kataloğu ↔ swig-guard listesini karşılaştırır (bir kodu silerek **testin gerçekten kırıldığı doğrulandı**). Dört üretici nokta `satisfies ClientFindingCode` ile tiplendi (eklenti `analyze-client.ts` ve `handlers.ts`, showcase `analyze.ts`, agent-guard `agent.ts`).
- **Kanıt:** `pnpm typecheck` yeşil; swig-guard 16, agent-guard 16, eklenti 89 test yeşil; yeni test 3/3. Güncellenen dokümanlar: `AGENTS.md` (aynalar), `docs/architecture/packages.md`, `docs/architecture/server.md` §15, `packages/swig-guard/README.md`.
- **Plandan sapma (gerekçeli):** `ANALYZE_UNREACHABLE` mesajı **tek yardımcıdan üretilmedi**: üç yüzeyin metni bilerek farklı (eklenti "Sign only if you trust this dApp", showcase, agent-guard "allowOffline"); metin birleştirmek davranış değiştirir ve T1.2'nin konusu. Showcase'in payload tipi kopyaları ve `/developers` portalının kendi `RiskFinding` tipi (genel API şeklini modeller) **bırakıldı**; yalnız üretici nokta tiplendi.
- **Açık kalan (T0.3 kapsamı dışı):** `(string & {})` kaçış kapısı forward-compat için bilerek duruyor.

#### T0.4 Stellar SDK sürüm birleştirme 🚫 (ertelendi, gerekçeli)
- **Karar (2026-09-20):** yapılmıyor. Kanıt (çalıştırılarak doğrulandı):
  - Doğrudan bağımlılıklar: eklenti 16.2.0; sunucu, showcase, cüzdan, agent-guard, swig-guard, adapter 15.1.0.
  - Kilit dosyada tek sürüm **elde edilemez**: `passkey-kit` 0.14.0 kendi içinde SDK 14.6.1, `@x402/stellar` 2.14.0 SDK 14.6.1, eklentideki bir bağımlılık 16.0.0-rc.1 çekiyor (`pnpm why`). Bunları `overrides` ile zorlamak bu kütüphaneleri kırabilir.
  - İki majör de bizim ihtiyacımız olan API'yi **aynı** sunuyor: `WebAuth.{buildChallengeTx, readChallengeTx, verifyChallengeTxSigners, verifyChallengeTxThreshold, gatherTxSigners, verifyTxSignedBy}`, `Keypair.verify`, `hash`. `buildChallengeTx` + `readChallengeTx` turu her iki sürümde çalıştı.
  - Sunucuyu 16'ya çekmek Render'da çalışan kodu değiştirir ve kullanıcıya hiçbir şey kazandırmaz.
- **Sonuç:** T1.3 (attestation) ve T2.1 (SEP-10) yalnız iki majörde de bulunan API'leri kullanır (`Keypair.verify`, `hash`, `WebAuth.readChallengeTx`). Kod eklenti (16.x) ve agent-guard (15.x) arasında paylaşılacaksa bu kısıt geçerlidir.
- **Yeniden değerlendir:** ancak bir görev 16'ya özgü bir API'ye ihtiyaç duyarsa.

#### T0.5 CI ve altyapı ✅ (kısmen ertelendi, gerekçeli)
- ✅ Önceden: docs-check işi, Dockerfile filtresi, eski `openapi.yaml` silindi.
- ✅ **Kontrat CI'ı (2026-09-20, commit'lenmedi):** `cargo fmt --check`, `clippy -D warnings` (yalnız `merchant-spend-policy`), `cargo test`, `wasm32v1-none` release derlemesi. CI'da kullanılan komutların **tamamı kökten yerelde çalıştırıldı** (fmt temiz, clippy temiz, 14 + 26 test yeşil, wasm derleniyor). İş adı ("Contracts (cargo test)") **bilerek değiştirilmedi** (zorunlu durum kontrolü tanımlı olabilir).
  - `cargo fmt --all` üç kontrat kaynağını ve eski `payment-guard`'ı biçimlendirdi. **Wasm hash'i biçimlendirmeden önce ve sonra birebir aynı** (`9ba6094c…c098e55`, `merchant_spend_policy.wasm`), yani davranış değişmedi. Bu yerel derlemenin hash'i README'deki dağıtılmış hash'le (`122e762a…`) aynı olmayabilir; nedeni (araç zinciri) doğrulanmadı ve T3.1 deploy kaydında ele alınır.
  - 4 clippy uyarısı düzeltildi (test'lerde gereksiz `try_into`, vendored `Error` enum'u için gerekçeli `allow`).
  - `payment-guard` clippy kapsamı **dışında** (eski, ürün dışı; kullanımdan kalkmış `Events::publish` API'si 3 hata veriyor). Onu düzeltmek ürün değeri katmaz.
- ✅ **Secret taraması:** `scripts/check-secrets.mjs` + `pnpm secrets:check` + CI'da ayrı `secrets` işi. Checksum doğrulayan Stellar seed taraması, `baret_` anahtarı ve PEM. 7 sentetik senaryo (geçerli seed → 1, bozuk checksum → 0, izin işareti → 0, iki satır yukarıdaki işaret → 1, API anahtarı → 1, PEM → 1, temiz → 0) ve gerçek depo (543 dosya) doğrulandı. Depoda **yalnız iki** bilerek herkese açık demo anahtarı var (`DEMO_ISSUER`, `USDC_DRAINER`, showcase `transactions.ts`); ikisi `secret-scan: allow <neden>` ile işaretlendi.
- 🚫 **Ertelendi:** (a) gerçek ESLint: bir kerede yüzlerce uyarı üretir ve yeni özellik işini geciktirir; özellik fazlarından sonra ele alınır. (b) showcase `test` script'i: 0 test varken anlamsız; T1.1/T1.2 showcase'e test eklerken açılır. (c) `DELTAG_*` adları bilerek korunur (belgeli miras).
- ❓ **Doğrulanmadı:** Docker derlemesi (bu makinede `docker` yok); `frozen-lockfile` + kısmi manifest kopyasıyla derleme.
- **Kanıt:** `pnpm docs:check` OK, `pnpm secrets:check` OK, showcase typecheck yeşil, server 20 dosya / 168 test yeşil. CI YAML `js-yaml` ile geçerli ayrıştırıldı (GitHub'da koşmadı; ilk push'ta bakılacak).
- **Doküman:** `AGENTS.md` (Komutlar), `README.md` (Useful commands), `ARCHITECTURE.md` (scripts satırı), `docs/README.md` (Otomatik denetim), `docs/architecture/packages.md` (CI cümlesi), `contracts/README.md`.

#### T0.6 Testnet dayanıklılığı ✅
- **Yapıldı (2026-09-20, commit'lenmedi):** `pnpm --filter @stellar-thorn/server chain-check` (`apps/server/src/scripts/chain-check.ts`): (1) MerchantSpendPolicy'de salt-okunur `get_allowance` **simüle eder** (`Error(Contract, #3)` = kontrat çalıştı; restore gerekmesi veya kontratın yokluğu = FAIL), (2) eklentinin `smart-wallet-config.ts`'inden okuduğu smart-wallet wasm hash'inin varlığını, (3) x402 USDC token kontratının varlığını denetler. Sorun varsa çıkış 1. Haftalık ve elle koşulan `.github/workflows/testnet-health.yml` (GitHub'da henüz koşmadı).
- **Kanıt (canlı testnet, 2026-09-20):** üç kontrol de OK: politika kontratı yanıt veriyor, smart-wallet wasm ≈ 177.9 gün, USDC ≈ 140.0 gün TTL. Başarısız yol da doğrulandı (`--min-days 1000` → WARN + çıkış 1). 8 birim testi (sınıflandırma mantığı) yeşil; server 21 dosya / 176 test yeşil; `docs:check` ve `secrets:check` OK.
- **Önemli gözlem:** public testnet RPC, MerchantSpendPolicy'nin kendi instance ve wasm kayıtları için `liveUntilLedgerSeq: 0` döndürüyor, oysa kontrat çalışıyor (simülasyon mantığa ulaşıyor, restore yok). Nedeni **doğrulanmadı**; betik 0'ı "TTL bilinmiyor" sayıp canlılığı simülasyonla ölçer. Kontratın TTL'i bu yüzden RPC'den okunamıyor; `stellar contract extend` ile düzenli uzatmak güvenli olur (DEPLOYMENT.md'de komutlar).
- **Yapılmadı (bilerek):** TTL'i otomatik uzatan anahtarlı bir "keeper" (gizli anahtar gerektirir); yeniden deploy prosedürü zaten `DEPLOYMENT.md`'de.
- **Doküman:** `contracts/contracts/merchant-spend-policy/DEPLOYMENT.md` (yeni "Liveness and TTL" bölümü), `docs/architecture/server.md`, `apps/server/README.md`, `AGENTS.md`, `README.md`.

#### T0.7 Zincir üstü uçtan uca canlı doğrulama ⏳ (yüksek değer)
- **Neden:** README'nin ana iddiası (tavan zincirde uygulanır) canlı testnet'te yeniden koşulmadı (`DEPLOYMENT.md` "End-to-end verification").
- **Adımlar:** listeyi çalıştır (smart wallet deploy → yeni merchant'a ilk x402 ödemesi → `set_allowance` + `add_signer` işlemleri → limit üstü ödemenin reddi → mandate yenileme testi); sonucu tarih, cüzdan adresi ve işlem hash'leriyle `DEPLOYMENT.md`'ye yaz.
- **Riskler → önlem:** UI gerektirir (kullanıcıyla birlikte); passphrase önbelleği 5 dk TTL → adımları ardışık yap; sonucu T1.5'in mandate-yenileme hatasıyla ilişkilendir.
- **Kabul:** kayıtlı, tekrarlanabilir bir doğrulama; sonuç `docs/implementation-status.md` §4'e yansır.

### Faz 1: Güvenlik ve dürüstlük

#### T1.1 Sahte/uydurma veriler ⏳
- **Doğrulandı (main):** Scrybe `ORACLE_STATS` ("48,210 Questions answered", "0.9s", "100%") ve `RECENT_QUESTIONS` (sahte "just now/12s ago" akışı) hâlâ var.
- **Önceki denetimden, koda bakarak yeniden doğrulanacak** (denetim eski ağaçtaydı): diğer 5 dApp'te "Sample data" etiketi eksik olabilir; Hub "14% APY" ↔ OrbitYield "7.4%" çelişkisi; `apps/showcase/index.html`'de eski "PaymentGuard" anahtar kelimesi; Scrybe cevapları hazır metin (ödeme gerçek, "oracle" değil) ve UI'da belirtilmemiş.
- **Adımlar:** sayaçları sil ya da oturumun gerçek geçmişiyle değiştir; tüm kurmaca dApp'lere tek bir "Fictional demo dApp" bandı (paylaşılan `SiteShell`'de); çelişen sayıları düzelt; Scrybe'in cevaplarının hazır olduğunu UI/README'de söyle.
- **Riskler → önlem:** Tailwind `/NN` opaklık sınıfları token renklerde üretilmez → `index.css` `tint-*` yardımcıları (AGENTS.md); light+dark ikisini de kontrol et.
- **Kabul:** ekranda etiketsiz uydurma sayı yok; tarayıcıda elle doğrulandı.
- **Doküman:** `docs/architecture/clients.md` §1, `docs/showcase-briefs.md`, `apps/showcase/README.md`.

#### T1.2 Offline, cold-start ve kopyalar ⏳
- **Bulgu:** eklenti timeout'u 25 sn, Render cold start ≈ 30 sn → uyuyan sunucuda ilk imza "korumasız" advisory'sine düşer; advisory'de Sign butonu açık; popup kopyası ("Sign stays locked…") ve showcase kopyası ("won't sign unchecked…") davranışla çelişiyor. Popup'ta "Retry analysis" var (LIMITATIONS).
- **Adımlar:** (a) timeout'u ≈ 45 sn'ye çıkar; (b) "sunucu uyanıyor…" durumu göster; (c) popup açılırken `/health` ile ısıtma isteği; (d) offline advisory'de Sign için **bilinçli onay** (blok override'ı gibi basılı tut) iste; (e) çelişen kopyaları düzelt; (f) showcase çağrılarına `AbortController` + zaman aşımı mesajı.
- **Riskler → önlem:** (d) kullanıcıyı sinirlendirebilir → yalnız `offline:true` iken; x402 otomatik imza (D2) bu görevden **etkilenmez**; isteğe bağlı ısıtma isteği rate limit'i tüketmez (`/health` muaf).
- **Kabul:** uyuyan sunucuda ilk imza doğru durumu gösterir; offline'da onaysız imza yok; testler (analyze-client) güncellendi.
- **Doküman:** `docs/extension-architecture.md`, `docs/implementation-status.md` §2.2, `LIMITATIONS.md`.

#### T1.3 Attestation uçtan uca ⏳
- **Hedef:** eklentinin sunucu kararını Ed25519 imzasıyla doğrulaması ("sahte `safe:true`" riskini kapatmak).
- **Adımlar:** (1) tarayıcı-güvenli doğrulayıcı yaz (`node:crypto` yerine SDK `hash`; `agent-guard`'daki kodu paylaşılan bir modüle çıkar, `swig-guard` SDK'sız kalır); (2) sunucu ile doğrulayıcı için **ortak test vektörü** (kanonik payload birebir); (3) `signedAt` tazelik penceresi; (4) açık anahtarı eklentiye **pin'le** (sunucudan öğrenmek TOFU); (5) imza kapsamını `reasons` ve `estimatedChanges`'i de içerecek şekilde **v2 (sürümlü)** genişlet; (6) canlıda `BARET_SIGNING_SECRET` ayarla (D4, kullanıcı).
- **Riskler → önlem:** eski/imzasız sunucu → ilk sürümde eksik attestation **uyarı**, blok değil; kanonik payload değişimi `agent-guard` ile kırılır → sürüm alanı + iki tarafta aynı PR; Zod şeması bir finding'e şema dışı alan eklenirse alanı siler ve özet tutmaz (sunucu tuzağı) → test ekle.
- **Bağımlılık:** T0.1 ✅ (T0.4 ertelendi; yalnız iki SDK majöründe de bulunan API'ler kullanılır).
- **Kabul:** yanlış/eksik imzada eklenti uyarır; sunucu imzasıyla vektör testi geçer; canlı meta `attestation.enabled=true`.
- **Doküman:** `docs/x402-defense.md` §10, `docs/architecture/server.md` §13, `packages/agent-guard/README.md`, `docs/implementation-status.md` §1, `LIMITATIONS.md`.

#### T1.4 Sunucu küçük kalanlar 🟡
- ✅ Anahtarlar, anahtar başı limit, CORS, OpenAPI, portal.
- ⏳ (her biri **önce koda bakılarak doğrulanacak**): 500 "response validation failed" cevabında Zod `issues`'ın istemciye sızması (`apps/server/src/api/routes/analyze.ts`); `demo-paywall.ts`'te `buildRequirements` hatası 500 mü 502 mi; batch içinde sınırsız `Promise.all`; `X402_MEMO_MISSING` yalnız `policy.requireMemo` açıkken üretilir (varsayılan kapalı) → **sorun değil, dokümanda belirt**.
- **Kabul:** hata zarfı yükseltilmiş iç mesaj sızdırmaz (AGENTS.md kuralı); testler eklendi.

#### T1.5 Mandate yenileme hatası ⏳ (bilinen hata)
- **Sorun:** süresi dolan mandate yeniden onaylanınca yalnız yerel satır uzar; zincirdeki `set_allowance` süresi ve alt anahtarın `Temporary` signer süresi yenilenmez → eski alt anahtarla ödeme reddedilir.
- **Adımlar:** yenilemede yeni alt anahtar kur (ya da `set_allowance` + signer'ı yenile); sıra: yenisini ekle → eskisini kaldır; idempotent ve kısmi başarısızlığa dayanıklı; sonucu allowance satırında sakla.
- **Riskler → önlem:** kısmi başarısızlık (yeni eklendi, eski kalır) → durum alanı + yeniden dene; passphrase önbelleği 5 dk TTL → başarısızlıkta kullanıcıya "kilit aç" yönlendirmesi; canlı doğrulama T0.7'de.
- **Kabul:** birim testleri (mock'lu) + T0.7'de canlı doğrulama; `docs/implementation-status.md` §4 "Bilinen sorun" satırı kaldırılır.
- **Doküman:** `docs/x402-defense.md` §11, `LIMITATIONS.md`, `docs/implementation-status.md`.

#### T1.6 Varsayılan tavanları düşür ⏳ (D3)
- **Yer:** eklentideki geri dönüş değerleri (1 / 5 / 25) ve `BALANCED_POLICY` şablonu (`packages/swig-guard/src/policy.ts`). Önerilen yeni varsayılan: 0.5 / 2 / 5 USDC (sayıları kullanıcıya doğrulat).
- **Riskler → önlem:** mevcut allowance satırlarının tavanı provizyon anında sabitlenir (zincir + yerel) → yalnız **yeni** mandate'ler etkilenir, bunu dokümanda söyle; `swig-guard` şablonlarıyla sunucu `policy-schema.ts` preset'leri birbirine bir testle bağlı → ikisini birlikte güncelle.
- **Kabul:** testler güncel; UI varsayılanları yeni değerleri gösterir.
- **Doküman:** `docs/policy-dsl.md`, `docs/wallet-spec.md`, `README.md`.

### Faz 2: Anchor (jüri için en ağır kalem)

**Ortak tasarım (T2.1-T2.7 için):**
- Yeni bir **`sep` modülü** eklenti background'unda yaşar (SEP-1 toml, SEP-10 giriş/doğrulama, SEP-6 istemci, isteğe bağlı SEP-38). Kendi ince `fetch` istemcimiz olur; `@stellar/typescript-wallet-sdk` MV3 service worker uyumu ve bundle etkisi **doğrulanmadığı** için ilk tercih değil (istenirse ayrı spike).
- Anchor'lar bir **domain allowlist** config'inde durur (varsayılan `tr-mock-anchor.fly.dev`). `<all_urls>` host izni **istenmez**; gerekirse `optional_host_permissions` + kullanıcı jesti. SEP-1 toml CORS `*` gerektirir (spesifikasyon), yine de başarısızsa "doğrulanamadı" uyarısı (sessiz geçme yok).
- **JWT yalnız bellekte** (SW belleği), diske yazılmaz; süre dolunca yeniden SEP-10. İşlem kayıtları IndexedDB'de (DB v5 migration, `db/index.ts`'teki `runMigrations` desenine uy; başka yerde `indexedDB.open` çağırma).
- SW askıya alınabildiği için **poll `alarms` ile** yapılır (`alarms` izni manifestte var, kodda kullanılmıyor).
- **İki imza yolu:** (i) Baret'in kendi Options akışı (giriş/çekme başlatan kullanıcı): sonuç Options UI'da gösterilir; (ii) üçüncü taraf dApp'ten gelen challenge: mevcut imza popup'ı + tanıyıcının bulguları. Kural: tanıyıcı `signTransaction` yolunda sunucuya sormadan önce çalışır (`txAnalyzeRequestHandler`).
- Yeni bulgu kodları `SEP10_*` / `SEP6_*` adıyla, T0.3'teki istemci-yerel kümeye eklenir.
- **Test yaklaşımı:** hermetik fixture'lar `WebAuth.buildChallengeTx` ile kendi anahtarımızdan üretilir (canlı challenge'ın zaman sınırı 15 dk); saldırı fixture'ları ayrı; canlı anchor'a karşı duman testi CI'da atlanır.

#### T2.1 SEP-10 challenge tanıyıcı ve doğrulayıcı ⏳
- **Bulgu:** gerçek bir tr-mock-anchor challenge'ı canlı Baret'e `safe:true`, 0 bulgu, "medium" güvenle çıkıyor; Baret bunun "bir anchor'a giriş, para hareketi yok" olduğunu anlamıyor. SDK `WebAuth.readChallengeTx` aynı challenge'ı doğruluyor (denendi).
- **Kurallar (SEP-10 v3.4.1):** sequence = 0; kaynak hesap = sunucu imzalama anahtarı ve toml `SIGNING_KEY` ile eşit; ilk op `manage_data`, anahtarı `<home_domain> auth`, kaynağı **istemci hesabı**; `web_auth_domain` op'u sunucu kaynaklı ve istenen domain'le aynı; diğer `manage_data` op'ları sunucu kaynaklı (ya da `client_domain` hesabı); zaman sınırı; sunucu imzası geçerli.
- **Sahte challenge işaretleri (bulgu):** sıfır olmayan sequence, `manage_data` dışı op (`payment`, `setOptions`, `accountMerge`), toml anahtarıyla eşleşmeyen imza, kullanıcının bulunduğu origin'le uyuşmayan domain, beklenmeyen op kaynağı.
- **Riskler → önlem:** XDR'daki domain saldırgan kontrollüdür → sunucuda toml çekme (SSRF) yerine **eklentide** çek; toml ≤ 100 KB, zaman aşımı, kısa önbellek; SDK `readChallengeTx` hangi kuralları zorladığı **doğrulanmadı** (SDK kaynağını okuyarak eksikleri kendi kontrolümüzle tamamla).
- **Kabul:** meşru challenge "X'e giriş, para hareketi yok" der; her saldırı fixture'ı bloklanır; testler.
- **Doküman:** `docs/extension-architecture.md`, `docs/implementation-status.md` §2, `docs/x402-defense.md` (gerekirse), README (Faz F).

#### T2.2 Ince SEP istemcisi (1/10/6) ⏳
- **Kapsam:** toml okuma; SEP-10 (`GET /auth`, doğrula, imzala, `POST /auth` → JWT); SEP-6 (`/sep6/info`, `deposit`, `withdraw`, `transaction`); işlem kayıtları (IndexedDB v5); `alarms` ile poll.
- **Riskler → önlem:** MV3 SW uyur → durum IndexedDB'de, poll alarmla; JWT süresi → yeniden giriş; anchor hataları (HTTP 4xx/5xx) → tipli hata + kullanıcı mesajı; ağ değişimi (yalnız testnet).
- **Bağımlılık:** T2.1, T0.3, T1.2.
- **Kabul:** birim testleri (fetch mock'u); Options'tan giriş + `info` çalışır.

#### T2.3 Hesap ön koşulları ve trustline ⏳
- `G…` hesabı fonlu ve USDC trustline'ı olmalı (yoksa yatırma `pending_trust`). Options akışı bunu kontrol edip yönlendirir (Friendbot + `changeTrust`).
- **Risk:** Baret'in kendi `TRUSTLINE_CHANGE_DETECTED` kuralı, `blockTrustlineChanges` açıkken (ör. STRICT) meşru anchor trustline'ını bloklar → toml `CURRENCIES` issuer'ıyla eşleşen trustline'a istisna tanı (anchor'ın bildirdiği varlık).
- **Kabul:** sıfır bakiyeli yeni hesapla yatırmaya kadar yönlendirilir.

#### T2.4 Çekme koruması (ana değer) ⏳
- **Akış:** `/sep6/withdraw` cevabındaki `account_id`, `memo_type`, `memo` ve tutar **beklenen ödeme** olarak kaydedilir; imza anında tek bir klasik `payment` op'u aranır: hedef = `account_id`, memo türü+değeri = beklenen, tutar tam eşit, varlık = `USDC:GBBD47IF…`. `account_merge`, `path_payment`, ek op, farklı hedef/memo/tutar/varlık **bloklanır** (`X402_DESTINATION_MISMATCH` mantığı).
- **Riskler → önlem:** kilitli kur süresi dolar → uyarı ve yeni teklif; tutar ondalık kesinliği → `stroop` string karşılaştırması; kayıt yoksa (dApp'ten gelen bilinmeyen çekme) → **fail-closed** (blok/uyarı).
- **Kabul:** doğru çekme geçer; her uyuşmazlık fixture'ı bloklanır (hedef, memo, tutar, varlık, ek op).

#### T2.5 Yatırma arayüzü ⏳
- Options'ta IBAN ve referans gösterilir; **sandbox** `simulate-bank-transfer` düğmesi açıkça "sandbox" etiketli; durum `completed` olana kadar izlenir.
- **Risk:** yatırma USDC'yi `G…`'ye bırakır (`C…` değil) → T2.6.

#### T2.6 `G ↔ C` köprüsü ⏳ (önce spike)
- **Sorun:** anchor USDC'yi klasik `G…` hesabına yatırır; Baret x402'yi akıllı cüzdandan (`C…`) öder. Yatırma sonrası `G → C` (SAC `transfer`) ve çekme için `C → G` gerekir.
- **Spike sorusu:** anchor çekme ödemesini SAC transferi olarak da görüyor mu? Bilinmiyor → **klasik `payment`, memo'lu, `G`'den** varsay ve mock'ta dene.
- **Riskler → önlem:** iki transfer de Baret'in kendi imza akışından geçer; `C` yetkisi authority admin imzası gerektirir; küçük tutarlarla test.
- **Kabul:** TL → USDC (`G`) → `C` → x402 ödemesi tek akışta çalışır.

#### T2.7 SEP-38 fiyat gösterimi (isteğe bağlı) ⏳
- Salt-okunur TRY/USDC fiyatı ve %0.5 spread. Tam yollar rehberde yok → toml/explorer'dan oku.

#### T2.8 "AnchorDesk" showcase senaryosu (isteğe bağlı) ⏳
- Mevcut demo dApp desenine (Danger Mode) uygun: güvenli akış (tr-mock-anchor) ve tehlikeli akış (sahte anchor login'i, yönlendirilmiş çekme hedefi). Baret'in T2.1/T2.4'ü canlı gösterir.
- **Riskler:** showcase yalnız `window.baretStellar`/Freighter'a bağlanır; senaryo gerçek, gönderilebilir testnet işlemi olmalı (AGENTS.md/showcase kuralları); `docs/showcase-briefs.md` tablosu güncellenir.

### Faz 3: Zincir üstü (kontrat v2)

#### T3.1 MerchantSpendPolicy v2 ⏳
- **Bulgu:** `spend_log: Vec<(u64,i128)>` sınırsız. Ölçüm (scratch): 1000 kayıt ≈ 44 KB, 8 M CPU; darboğaz tek ledger entry'nin boyutu ve her ödemede tamamını yazma ücreti. 0.001 USDC ödemelerle günde 1 USDC → ~1000, 25 USDC → ~25.000 kayıt. Entry limiti (~64 KiB) ağ ayarından doğrulanmadı.
- **Tasarım:** sabit uzunluklu **25 saatlik bucket** + `head_hour`; her çağrıda kaydır/sıfırla; toplamı bucket'lardan al. **Tam kayan pencere korunmaz:** 24 bucket cap'in 2 katına izin verir; 25 bucket cap'i hiç aşmaz (ödeme 24-25 saat sayılır, en fazla 1 saat fazladan kilit). Entry ≈ 450 B, CPU O(25).
- **Aynı görevde:** vendored arayüzle çakışan `Error` enum'unu yeniden adlandır (bindings üretimini engelliyor); `pause/resume/revoke` ve harcama için **event** (post-sign monitör için); `Revoked` kalıcı olsun (`resume` geri açmasın); `mandate_seconds` üst sınırı.
- **Testler:** mevcut `rolling_window_resets_after_24h` `+DAY+1` kullanıyor ve kırılır → `+DAY+3600+1`; "24 saat dolmadan yeni cap açılmaz" ve bucket sınırı testleri.
- **Riskler → önlem:** kontrat **upgrade edilemez** → yeni wasm = yeni kontrat ID (deploy'u kullanıcı onayıyla yap, deployer anahtarı/fonu gerekir); eski cüzdanlar eski `Policy(id)`'ye bağlı kalır → T3.2; wasm hash'i README'dekiyle farklı çıkabilir (araç/derleyici) → yeni hash'i bu deploy kaydına yaz.
- **Bağımlılık:** S1 (#22).
- **Doküman:** `contracts/README.md`, `DEPLOYMENT.md`, kök `README.md` (adres/hash/test sayısı), `docs/x402-defense.md` §11, `smart-wallet-config.ts`.

#### T3.2 Eklenti migrasyonu ⏳
- DB v5: allowance/`sub_keys` satırlarına `policyContractId`; eski ID'ye bağlı alt anahtarları tespit edip yeniden kur (yoksa otomatik imza zincirde sessizce başarısız olur); `smart-wallet-config.ts`, README, `DEPLOYMENT.md`, `sub-keys.test.ts` mock ID'leri.
- **Test:** `fake-indexeddb` ile eski şemadan yükseltme (`db/index.test.ts` desenine uy).
- **Bağımlılık:** T3.1.

#### T3.3 Tipli kontrat istemcisi ⏳
- `stellar contract bindings typescript` **deprecated** (stellar-cli PR #2724, 2026-09-15); yerine `npx @stellar/stellar-sdk generate --contract-id <C…> --network testnet --output-dir …`. Elle yazılan `MerchantSpendPolicyClient` arayüzü bununla değişir.
- **Bağımlılık:** T3.1 (Error çakışması). Bu komutu henüz çalıştırmadık.

### Faz 4: Ücret sponsorluğu ve UX

#### T4.1 OpenZeppelin Channels ile ücret sponsorluğu ⏳
- Ücretsiz hosted testnet var (`channels.openzeppelin.com/testnet`, API anahtarı oradan); istemci `@openzeppelin/relayer-plugin-channels`; `{func, auth[]}` (simüle+fee-bump) veya imzalı `xdr`; yalnız `invokeHostFunction`; anahtar başı 24 saatlik ücret bütçesi (`FEE_LIMIT_EXCEEDED`).
- **Tasarım:** anahtar eklentiye **gömülmez**; sunucuda bir `/v1/relay` vekili (izinli çağrılar: `add_signer`, `add_policy`, `set_allowance` benzeri; rate limit). Yedek: bugünkü gibi authority öder.
- **Riskler → önlem:** passkey-kit'in assembled işlemi `{func, auth}` moduyla uyumlu mu **bilinmiyor** → önce küçük spike; vekil kötüye kullanım → izin listesi + kota; yeni `/v1` rotası → AGENTS.md rota kuralları.

#### T4.2 Passkey spike, sonra `apps/wallet` ⏳ (D6)
- **Zaman kutulu 1 gün, sonunda go/no-go.** Mevcut pin (`passkey-kit` 0.14, wasm `fdefad64…`) ile kal; yükseltme yok (güncel 0.19.1 farklı wasm `97ce0478…` kullanıyor ve 0.17.0 öncesi cüzdanlara bağlanmıyor; MerchantSpendPolicy uyumu test edilmedi).
- Eklentide riskli (SW'de WebAuthn yok, `chrome-extension://`/`moz-extension://` origin davranışı doğrulanmadı); yalnız **web cüzdanında** (HTTPS + sabit domain; credential domain'e bağlı).
- `apps/wallet` için Vercel yapılandırması ve API anahtarı/rewrite eksik; smart wallet hâlâ yer tutucu.
- **Kabul:** spike raporu + karar bu dosyaya yazılır.

### Faz 5: Doküman ve yayın

#### T5.1 `baret_docs` deploy ⏳
- İçerik sunucuyla eşleşecek biçimde yenilendi (PR #41); deploy tanımı yok. Ayrı bir Vercel projesi + README/`docs/README.md` bağlantısı. Kullanıcı Vercel erişimi gerekir.

#### T5.2 Sürekli: doküman protokolü
- Her görevde `AGENTS.md` protokolü; her `docs/`-altı yeni dosya `docs/README.md` dizinine eklenir; `pnpm docs:check` CI'da.
- **`PLAN.md`'yi indekse ekle:** `docs/README.md` "Tüm dokümanlar" tablosuna satır ve `AGENTS.md`'ye tek satır bağlantı (S0'dan sonra, temiz ağaçta).

### Faz F: En sona (kullanıcı talebi, D5)

- **F1 README (EN):** iki Mermaid diyagramı (bileşen akışı + x402/anchor sequence), "Stellar kaynakları ve Skills referansları" bölümü, canlı demo linki, video, roadmap, SCF/InstaAwards niyeti, jüri hızlı başlangıcı (kurulumsuz yol dahil), anchor akışının adım adım anlatımı.
- **F2 Sunucuyu ayık tut:** Render free uyur (≈ 30 sn cold start) → ücretsiz bir ping/uptime servisi; ayrıca `keys.json` kalıcı değil (kalıcı disk ya da anahtarları `DELTAG_API_KEYS`'e ekle).
- **F3 Traction:** 10-20 gerçek test kullanıcısı (Stellar Türkiye topluluğu), geri bildirimler ve gerçek sayılar README'de. (Sunucu audit'i bellekte; gerçek sayı için ya kalıcı depo ya da "son yeniden başlatmadan beri" dürüst etiketi.)
- **F4 Demo videosu:** `docs/demo-script.md`'yi anchor akışıyla güncelle.
- **F5 (opsiyonel) InstaAwards SOW:** kökteki `.docx` boş şablon; doldurma ayrı bir iş.

## 7. Sıra ve bağımlılıklar

Önerilen sıra (bağımlılık sırasına göre):

1. **S0 → S1** (ortam ve PR hijyeni; #22 kontrat işi öncesi).
2. **T0.3 ✅ → T0.5** (zemin: tipler, CI; T0.4 ertelendi), **T0.6**.
3. **T1.1 → T1.2 → T1.6 → T1.5** (dürüstlük, davranış, tavanlar, hata), sonra **T0.7** (canlı E2E temel çizgi) ve **T1.3 → T1.4**.
4. **T2.1 → T2.2 → T2.3 → T2.4 → T2.5 → T2.6** (T2.7/T2.8 isteğe bağlı). Çekirdek: T2.1 + T2.4.
5. **T3.1 → T3.2 → T3.3**; ardından T0.7'yi v2 üzerinde yeniden koş.
6. **T4.1, T4.2** (bağımsız; T4.2 karar kapılı), **T5.1**.
7. **Faz F.**

| Görev | Bağımlı olduğu |
|---|---|
| T1.3 | T0.1 ✅ |
| T2.1 | T0.3 |
| T2.2 | T2.1, T1.2 |
| T2.3-T2.5 | T2.2 |
| T2.4 | T2.1, T2.2 |
| T2.6 | T2.4 (ve T2.5 bakiye üretir) |
| T3.1 | S1 (#22) |
| T3.2, T3.3 | T3.1 |
| T1.5 | T0.7 ile birlikte doğrulanır |

## 8. Proje geneli riskler

| # | Risk | Önlem |
|---|---|---|
| R1 | tr-mock-anchor (fly.dev) düşer/değişir | Bağımlılığı config'e al; testleri hermetik yaz; canlı duman testi CI dışı; organizatörlerden ayakta kalma teyidi (bir kez sorulmuştu, yanıt sürekliliği hakkında değildi) |
| R2 | Testnet sıfırlanır → kontrat/wasm kaybolur | T0.6 betiği + tekrar üretilebilir redeploy |
| R3 | Render free uyur, diski geçici | F2; anahtarlar için kalıcı disk ya da statik anahtar |
| R4 | passkey-kit pini eski, yeni wasm uyumsuz | D6: yükseltme yok |
| R5 | Aynı çalışma ağacında eşzamanlı oturum | `AGENTS.md` "Eşzamanlı çalışma"; düzenlemeden önce yeniden oku |
| R6 | MV3 service worker askıya alınır (bekleyen imzalar/kilit kaybolur) | poll'u `alarms` ile yap; durumu IndexedDB'de tut; tarayıcıda dene |
| R7 | Doküman ↔ kod sapması (`docs:check` anlam doğrulamaz) | `AGENTS.md` protokolü; her görevde ilgili tablo satırı |
| R8 | Herkese açık demo anahtarı (`dev-key-change-me`) kötüye kullanılır | Belgeli, bilinçli; anahtar başı/IP limit var; değiştirirsen üç yeri birlikte değiştir |

## 9. Değişiklik günlüğü

| Tarih | Değişiklik |
|---|---|
| 2026-09-20 (ilerleme 3) | S1 ✅: 7 yeşil PR merge edildi, 3 kırmızı bilerek açık. Görevler artık **görev başına commit** ediliyor (yerel `main`, henüz push edilmedi). Rebase sonrası düzeltmeler: workflow sürümleri hizalandı, `check-secrets.mjs` kendi PEM etiketini yakalıyordu (düzeltildi), `payment-guard` anlık görüntüleri yenilendi. |
| 2026-09-20 (ilerleme 2) | T0.6 ✅: `chain-check` betiği + haftalık `testnet-health.yml`; canlı testnet'te kontrat/wasm/USDC canlı (kontrat simülasyonla doğrulandı). T0.7'nin "kontrat canlı mı" kısmı böylece kanıtlandı; uçtan uca ödeme akışı hâlâ ⏳. |
| 2026-09-20 (ilerleme) | S0 ✅ (ayrı worktree `BaretStellar-main`, `main` @ `89395f5`; eski ağaç eşzamanlı oturumlar yüzünden bırakıldı). S1 değerlendirildi (7 PR yeşil, 3 kırmızı), merge kullanıcı onayında. T0.3 ✅ (`RISK_FINDING_CODES`/`CLIENT_FINDING_CODES` + drift testi, mutasyonla doğrulandı). T0.4 🚫 (transitif SDK kopyaları yüzünden tek sürüm imkânsız; iki majör aynı API'yi sunuyor). T0.5 ✅ kısmen (kontrat fmt/clippy/wasm CI, secret tarama betiği; ESLint ve showcase testi ertelendi). Hiçbir şey commit'lenmedi. |
| 2026-09-20 | İlk sürüm. `origin/main` @ `89395f5` üzerinden yeniden inceleme: PR #39-#43 merge, doküman seti yenilendi, canlı sunucu güncel. T0.1, T0.2 ✅; T0.5 kısmen ✅. Jüri kararı: tr-mock-anchor + SEP-1/10/6, SEP-24 yok. Yeni görevler: S0, T0.7, T1.5, T1.6, T2.8. T0.3 kapsamı "tek kaynak"tan "katalog + drift testi"ne daraltıldı (sunucu bağımsızlığı korunur; `critical` sapma değil). |
