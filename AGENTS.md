# Baret: geliştirici ve AI ajan kılavuzu

> Bu dosya repoya giren **her insanın ve her AI aracının** ilk okuması gereken kısa kılavuzdur (`CLAUDE.md` bu dosyayı içe aktarır).
> Ayrıntı yerine **nereye bakılacağını** söyler. Uzun anlatım: [`ARCHITECTURE.md`](./ARCHITECTURE.md), doküman haritası: [`docs/README.md`](./docs/README.md).

## Proje

**Baret**: Stellar için işlem güvenlik duvarı. İmzadan önce işlemi çözer/simüle eder/dedektörlerden geçirir (Safe/Caution/Blocked) ve AI agent'ların
x402 harcamalarına cüzdanda ve zincirde tavan koyar. pnpm monorepo, **testnet**, hackathon aşaması. Kullanıcı Türkçe konuşur; dokümanların dili için
[`docs/README.md`](./docs/README.md#dil-kuralı)'ya bak. Kod, commit mesajları ve kod içi yorumlar İngilizcedir.

## Önce bunları oku

1. [`ARCHITECTURE.md`](./ARCHITECTURE.md): parçalar, akışlar, güven sınırları, veri nerede.
2. [`docs/implementation-status.md`](./docs/implementation-status.md): spec'te yazan ile kodda **gerçekten var olan** arasındaki fark. Spec'lere körü körüne güvenme.
3. Dokunacağın alanın derin dalış dokümanı (`docs/architecture/*.md`, `docs/extension-architecture.md`, `docs/x402-defense.md`, `contracts/README.md`).

**Tek otorite koddur.** Doküman koda uymuyorsa dokümanı düzelt. Bilmediğin/doğrulayamadığın bir şeyi yazma; "doğrulanmadı" de.

## Komutlar

```bash
pnpm install                                     # Node ≥ 20, pnpm 9.15
pnpm dev:server        # :8080   (apps/server/.env gerekir; örnek: apps/server/.env.example)
pnpm dev:showcase      # :5175   (/api → :8080 proxy)
pnpm dev:wallet        # :5180
pnpm build:extension   # apps/extension/dist + dist-firefox + showcase/public/*.zip
pnpm build:guard && pnpm --filter @stellar-thorn/wallet-adapter build   # tüketiciler dist/'i okur; typecheck'ten ÖNCE
pnpm typecheck         # tüm workspace
pnpm test              # yalnız sunucu testleri; CI hepsini koşturur: pnpm -r --if-present test
pnpm --filter @stellar-thorn/extension test | @stellar-thorn/wallet test | ... test
pnpm --filter @stellar-thorn/server x402-setup   # demo satıcı anahtarı + testnet fonlama (tek seferlik)
pnpm docs:check        # doküman tutarlılık denetimi (linkler, yollar, env, paketler)
cargo test --manifest-path contracts/Cargo.toml  # Soroban kontratları
cd baret_docs && npm install && npm run lint && npm run build   # API doküman sitesi (workspace DIŞI)
```

Sunucu testleri ağa ihtiyaç duymaz. Eklenti popup/options'ı, showcase ve cüzdan için otomatik UI testi yoktur; değişikliği tarayıcıda doğrula.

## Harita

| Yol | Ne |
|---|---|
| `apps/server` | Fastify analiz + x402 + geliştirici API'si → [`docs/architecture/server.md`](./docs/architecture/server.md) |
| `apps/extension` | Chrome/Firefox MV3 cüzdan (asıl ürün) → [`docs/extension-architecture.md`](./docs/extension-architecture.md) |
| `apps/showcase` | Landing + 7 demo dApp + `/developers` + `/agents` + `/install` → [`docs/architecture/clients.md`](./docs/architecture/clients.md) |
| `apps/wallet` | Bağımsız web cüzdanı (smart wallet yer tutucu) |
| `packages/*` | `swig-guard`, `agent-guard`, `wallet-adapter`(dizin `baret-adapter`), `ext-protocol`, `ui`, `showcase-ui` → [`docs/architecture/packages.md`](./docs/architecture/packages.md) |
| `contracts/` | `merchant-spend-policy` (güncel), `payment-guard` (eski) → [`contracts/README.md`](./contracts/README.md) |
| `baret_docs` | Herkese açık API dokümanı (Next.js + MDX, kendi `package-lock.json`'ı) |
| `docs/` | Spec ve tasarım dokümanları |

## Kod konvansiyonları

- **TypeScript strict.** Sunucu ESM/NodeNext: göreli import'larda `.js` uzantısı yazılır. `noUnusedLocals/Parameters` açık.
- **Sınırlarda Zod** ile doğrula (env, HTTP gövdesi, cevap). Hatalar tek zarftan döner: `apiError(code, message, details?)` (`apps/server/src/api/errors.ts`). Yükseltilmiş RPC/kütüphane hata mesajını **asla** istemciye yansıtma.
- **Fail-closed.** Veri eksik/hesaplanamıyorsa izin verme, blokla. Yeni güvenlik kontrolünde varsayılanı "reddet" yap.
- **Yeni `/v1` rotası:** `PUBLIC_ROUTES`'a bilerek eklemedikçe otomatik anahtar ister. Rotayı `apps/server/src/api/openapi.ts`'e yaz (`openapi.test.ts` her kayıtlı rotayı zorlar),
  showcase portal kataloğuna (`apps/showcase/src/pages/developers/endpoints.ts`; `portal-catalog.test.ts` karşılaştırır) ve `baret_docs`'a ekle.
- **Yeni eklenti RPC'si:** önce `packages/ext-protocol/src/index.ts`, sonra `background/messaging/handlers.ts`. Gizli anahtar yalnız service worker belleğinde durur; loglama, mesajla taşıma, popup/content'e verme. Otomatik (kullanıcısız) imza yolları `useAuthority({isAutomatic:true})` kullanır.
- **Elle senkron tutulan aynalar** (birini değiştirirsen diğerini de değiştir): sunucu `domain/*` ↔ `packages/swig-guard/src/types.ts` (bulgu kodu listesi `apps/server/test/domain/finding-codes.test.ts` ile kilitli); `attestation/sign-verdict.ts` ↔ `packages/agent-guard/src/attestation.ts` (kanonik payload birebir);
  `api/policy-schema.ts` preset'leri ↔ `swig-guard/src/policy.ts` şablonları; `PaymentRequirements` şekilleri (server/extension/showcase).
- **UI:** renk/tipografi yalnız `@stellar-thorn/ui` token'larından; light ve dark ikisi de doğru olmalı. `apps/showcase`'te Tailwind, `var()` tabanlı token renklerde `/NN` opaklık sınıflarını (`bg-primary/10`) **üretmez**; `index.css`'teki `tint-*`, `glass-bg` vb. yardımcıları kullan.
- **Metin sesi** (UI, README, hata metni): [`docs/positioning.md`](./docs/positioning.md). Kısa, dürüst ("testnet ise testnet de"), pazarlama sözcüğü ve gereksiz uzun tire yok.
- Yorumlar "ne"yi değil **neden**i anlatır; çevredeki yorum yoğunluğuna uy. Ölü kod ve kullanılmayan bayrak ekleme (spec'te var diye uygulanmamış alan bırakmak dokümanı yalancı yapar: [`docs/implementation-status.md`](./docs/implementation-status.md)).

## Tuzaklar

- **İsim mirası:** `DELTAG_*` env'leri (aktif, gerekli), `@stellar-thorn/*` kapsamı, `swig-guard`, `extension/src/background/swig/`, `packages/baret-adapter` dizini ↔ `wallet-adapter` paketi. Tam liste: `ARCHITECTURE.md` §9. Rastgele yeniden adlandırma.
- Sunucuda **boş `policy` `{}` blok eder** (eksik veri/başarısız simülasyon). Bulgu, ilgili policy bayrağı olmadan bloklamaz.
- **Showcase, eklenti ve `render.yaml` aynı herkese açık demo anahtarını (`dev-key-change-me`) paylaşır**; değiştirirsen üçünü birlikte değiştir.
- Sunucu tek ağa bağlıdır; farklı ağ isteyen istek `WRONG_NETWORK` alır.
- `/demo/scrybe` ve `/demo/cortex` yalnız `X402_MERCHANT_SECRET` varsa vardır.
- Anahtar deposu (`BARET_DATA_DIR/keys.json`) ephemeral diskte kaybolur.
- Bu makinede: `cp` `-i` alias'lıdır (`\cp -f`), zsh'de glob'ları tırnakla, `pkill -f` kendi kabuğunu öldürür.

## Eşzamanlı çalışma

Çalışma ağacında başka bir oturum/kişi aynı anda düzenleme yapıyor olabilir (özellikle geliştirici portalı ve sunucu API'si). Bir dosyayı düzenlemeden hemen önce **yeniden oku**, başkasının
değişikliklerini geri alma (`git checkout/reset/stash` ile ezme), `git status` ile beklenmedik değişiklikleri fark et ve kullanıcıya söyle. Commit yalnız istenince yapılır.

## Doküman protokolü (ZORUNLU)

Kod değiştiren her iş, **bitmeden önce** ilgili dokümanı da günceller. Kısa yol:

1. Değiştirdiğin alanı [`docs/README.md`](./docs/README.md#kod--doküman-haritası) içindeki **Kod ↔ doküman** tablosunda bul, listelenen dokümanları güncelle (yeni rota, env, policy alanı, RPC, dedektör, port, paket, kontrat adresi/hash…).
2. Spec'teki bir vaadi uyguluyor ya da kaldırıyorsan [`docs/implementation-status.md`](./docs/implementation-status.md) satırını çevir (⏳ ↔ ✅) ve kanıt dosyasını yaz.
3. Yeni dosya/dizin/paket/env eklediysen ilgili README'ye ve `docs/README.md` dizinine ekle.
4. Doğrulanmış bir doküman başlığındaki "Son doğrulama" tarihini yalnızca gerçekten **kodla karşılaştırdıysan** güncelle.
5. `pnpm docs:check` çalıştır (bozuk link, var olmayan yol, belgelenmemiş env/paket yakalar). CI'da da koşar.
6. Sonuç mesajında hangi dokümanları güncellediğini yaz.

Bir bilgi kodla çelişiyorsa: dokümanı düzelt, sonra (gerekiyorsa) kullanıcıya "kodda şu sorun var" de. Sessizce ikisinden birini seçme.

## Git

- Commit/PR yalnızca kullanıcı isterse. Ana dal `main`; özellikler `feat/…`, düzeltmeler `fix/…`, doküman işleri `docs/…` dallarında (bkz. `git log`).
- Commit mesajı kısa emir kipinde İngilizce, "neden"i anlatır (mevcut geçmişe bak). **Otomatik araç imzası, oturum linki, `Co-Authored-By`, "Generated with" satırı eklenmez**; commit ve PR metinleri tamamen kullanıcının kendi çalışması gibi okunur.
- `.gitignore`'daki şeyleri (`dist/`, `.env`, `apps/server/data/`, `*.zip`, `.claude/`) commit'leme. Gerçek sırları (`S…` seed, API anahtarı) asla dosyaya yazma.
