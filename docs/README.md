# Doküman haritası

> Baret'in tüm dokümanlarının tek girişi. **Nereden başlanır, hangi doküman neye güvenilir, kodu değiştirince hangi doküman güncellenir**
> burada yazar. Son doğrulama: 2026-09-19 (kaynak koda karşı).

## Nereden başlamalı

| Sen kimsin | Sırayla oku |
|---|---|
| Projeyi ilk kez görüyorsun | [`PROJE_OZETI.md`](../PROJE_OZETI.md) (sade dil) → [`README.md`](../README.md) → [`ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Kod yazacaksın (insan ya da AI) | [`AGENTS.md`](../AGENTS.md) → [`ARCHITECTURE.md`](../ARCHITECTURE.md) → [`implementation-status.md`](./implementation-status.md) → dokunacağın alanın derin dalışı |
| Sunucu/API | [`architecture/server.md`](./architecture/server.md) → `GET /openapi.json` → [`../baret_docs`](../baret_docs) |
| Eklenti/cüzdan | [`extension-architecture.md`](./extension-architecture.md) → [`x402-defense.md`](./x402-defense.md) → [`wallet-spec.md`](./wallet-spec.md) |
| Kontrat | [`../contracts/README.md`](../contracts/README.md) → `contracts/contracts/merchant-spend-policy/DEPLOYMENT.md` |
| Deploy/işletme | [`../DEPLOY.md`](../DEPLOY.md) → [`../LIMITATIONS.md`](../LIMITATIONS.md) |
| Tasarım/marka/metin | [`brand.md`](./brand.md), [`positioning.md`](./positioning.md) |

## Güvenilirlik dereceleri

Her doküman aşağıdakilerden biridir. Çelişki olursa **kod > implementation-status > mimari dokümanlar > spec dokümanları > tasarım/vizyon**.

| Tür | Anlamı | Dokümanlar |
|---|---|---|
| **Doğrulanmış mimari** | Koda bakılarak yazıldı, tarihli. Yanlışsa hata sayılır | `ARCHITECTURE.md`, `architecture/*`, `implementation-status.md`, `extension-architecture.md`, `x402-defense.md`, `policy-dsl.md`, `contracts/README.md`, paket/uygulama README'leri |
| **Spec (niyet + durum notu)** | Hedef davranışı anlatır; başlığındaki durum tablosu gerçeği söyler | `wallet-spec.md`, `showcase-briefs.md` |
| **Tasarım/vizyon** | Yön ve ses. Uygulama durumu iddiası taşımaz | `vision.md`, `positioning.md`, `brand.md`, `demo-script.md`, `research/wallet-ux.md` |
| **İşletme** | Nasıl çalıştırılır/deploy edilir/sınırlar | `DEPLOY.md`, `LIMITATIONS.md` |
| **Herkese açık API** | Dış geliştirici içindir; sunucu davranışıyla birebir olmalı | `baret_docs/`, canlı `GET /openapi.json` |

Durum sözlüğü (özellikle `implementation-status.md`'de): ✅ uygulanmış · 🟡 kısmen · ⏳ planlanmış/kodda yok · 🗃️ eski (ürün dışı).

## Tüm dokümanlar

| Doküman | Konu | Dil |
|---|---|---|
| [`../README.md`](../README.md) | Ürün tanıtımı, hızlı başlangıç, komutlar | EN |
| [`../PROJE_OZETI.md`](../PROJE_OZETI.md) | Kod bilmeden anlaşılır özet | TR |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Sistem haritası, akışlar, güven sınırları, veri nerede | TR |
| [`../AGENTS.md`](../AGENTS.md) / [`../CLAUDE.md`](../CLAUDE.md) | Geliştirici ve AI ajan kılavuzu (doküman protokolü burada) | TR |
| [`architecture/server.md`](./architecture/server.md) | Sunucu iç yapısı | TR |
| [`architecture/packages.md`](./architecture/packages.md) | Paketler ve bağımlılıkları | TR |
| [`architecture/clients.md`](./architecture/clients.md) | Showcase, bağımsız cüzdan, portal, API doküman sitesi | TR |
| [`implementation-status.md`](./implementation-status.md) | Spec ↔ gerçek farkı (özellik defteri) | TR |
| [`extension-architecture.md`](./extension-architecture.md) | Eklenti yüzeyleri, mesajlar, DB, kripto, build | EN |
| [`x402-defense.md`](./x402-defense.md) | x402 protokolü, saldırı matrisi, attestation, zincir üstü alt anahtar | EN |
| [`policy-dsl.md`](./policy-dsl.md) | `GuardPolicy` şeması ve nerede uygulandığı | EN |
| [`wallet-spec.md`](./wallet-spec.md) | Cüzdan yüzeyleri/akışları (spec + durum) | EN |
| [`vision.md`](./vision.md) | Misyon, kama, kullanıcı, kapsam dışı | EN |
| [`positioning.md`](./positioning.md) | Konumlandırma ve metin sesi kuralları | EN |
| [`brand.md`](./brand.md) | Marka, renk, tipografi, bileşenler | EN |
| [`showcase-briefs.md`](./showcase-briefs.md) | Demo dApp tasarım brifleri (+ gerçek eşleşme tablosu) | EN |
| [`demo-script.md`](./demo-script.md) | 2 dk'lık demo videosu senaryosu | EN |
| [`research/wallet-ux.md`](./research/wallet-ux.md) | Cüzdan UX araştırma notu | EN |
| [`../LIMITATIONS.md`](../LIMITATIONS.md) | Bilinen sınırlar | EN |
| [`../DEPLOY.md`](../DEPLOY.md) | Ücretsiz canlıya alma | TR |
| [`../contracts/README.md`](../contracts/README.md) | Kontratlar | EN |
| `../contracts/DEPLOYMENT.md`, `../contracts/contracts/merchant-spend-policy/DEPLOYMENT.md` | Kontrat deploy kayıtları | EN |
| `../apps/*/README.md`, `../packages/*/README.md` | Paket/uygulama girişleri | EN |
| [`../apps/showcase/ASSET_PROMPTS.md`](../apps/showcase/ASSET_PROMPTS.md) | Görsel varlık kataloğu | EN |
| [`../baret_docs`](../baret_docs) | API doküman sitesi (MDX) | EN |

### Dil kuralı

- Dış dünyaya bakan (README, `baret_docs`, spec'ler, paket README'leri, UI metni): **İngilizce**.
- Projenin iç işleyişini anlatan mimari/işletme dokümanları (`ARCHITECTURE`, `PROJE_OZETI`, `DEPLOY`, `AGENTS`, `architecture/*`, `implementation-status`): **Türkçe**.
- Kod, kod yorumları, commit mesajları: **İngilizce**.
- Bir dokümanı başka dile çevirme; yeni doküman eklerken yukarıdaki kural neyse onu seç.

## Kod ↔ doküman haritası

**Kodu değiştirdiysen sağ sütundaki dokümanları da değiştir.** Bu tablo `AGENTS.md` protokolünün kalbidir.

| Değişen kod | Güncellenecek dokümanlar |
|---|---|
| `apps/server/src/config/**`, `render.yaml`, `docker-compose.yml`, `apps/server/Dockerfile` | `apps/server/.env.example`, `.env.production.example`, `DEPLOY.md`, `architecture/server.md` §7, `AGENTS.md` (komut/port değiştiyse) |
| `apps/server/src/api/**` (rota, auth, hata kodu, CORS, anahtar deposu, OpenAPI) | `architecture/server.md` (§4-5, §14), `baret_docs/src/app/*` (ilgili sayfa), `apps/showcase/src/pages/developers/endpoints.ts`, `README.md` (API bölümü), `LIMITATIONS.md` (yeni sınır varsa) |
| `apps/server/src/risk/**`, `domain/findings.ts`, `domain/detector-catalog.ts` | `architecture/server.md` §8, `baret_docs/src/app/detectors/page.mdx`, `packages/swig-guard/src/types.ts` (aynası) |
| `apps/server/src/policy/**`, `domain/policy.ts`, `api/policy-schema.ts`, `packages/swig-guard/src/policy.ts` | `policy-dsl.md`, `architecture/server.md` §9, `baret_docs/src/app/policies/page.mdx`, `implementation-status.md` §3 |
| `apps/server/src/{x402,infra/x402*,api/routes/demo-*}` | `architecture/server.md` §10, `x402-defense.md` §5/§7, `ARCHITECTURE.md` §4.4, `DEPLOY.md` (`X402_MERCHANT_SECRET`) |
| `apps/server/src/attestation/**`, `packages/agent-guard/src/attestation.ts` | `x402-defense.md` §10, `architecture/server.md` §13, `packages/agent-guard/README.md` |
| `apps/extension/src/background/**` (state, messaging, crypto, db, rpc, x402, swig, wallet-standard) | `extension-architecture.md`, `x402-defense.md`, `implementation-status.md` §2, `ARCHITECTURE.md` §4.2-4.3/§6 |
| `apps/extension/src/{popup,options}/**`, `content/**`, `inpage/**`, `manifest.config.ts` | `extension-architecture.md`, `wallet-spec.md` (durum tablosu), `apps/extension/README.md` |
| `packages/ext-protocol/**` | `extension-architecture.md` (§4 RPC/olay tabloları), `architecture/packages.md` |
| `packages/{swig-guard,agent-guard,baret-adapter,ui,showcase-ui}/**` | `architecture/packages.md`, o paketin `README.md`'si |
| `apps/showcase/src/**` (rota, site, portal) | `architecture/clients.md`, `showcase-briefs.md` (eşleşme tablosu), `apps/showcase/README.md`, `demo-script.md` (adımlar değiştiyse) |
| `apps/wallet/src/**` | `architecture/clients.md` §3, `apps/wallet/README.md` |
| `contracts/**` (kod, adres, wasm hash, deploy) | `contracts/README.md`, ilgili `DEPLOYMENT.md`, kök `README.md` (adres/hash/test sayısı), `apps/extension/src/background/swig/smart-wallet-config.ts`, `x402-defense.md` §11 |
| `baret_docs/src/**` | Sunucu davranışıyla eşleştiğini doğrula; `architecture/clients.md` §4 |
| `package.json` script'leri, portlar, CI | `AGENTS.md` (Komutlar), `README.md` (Useful commands), `architecture/packages.md` (build sırası), `.github/workflows/ci.yml` |
| Yeni dosya/dizin/paket | Bu tablo + `docs/README.md` dizini + ilgili README |
| Spec'te vaat edilen bir şey gerçekleşti ya da vazgeçildi | `implementation-status.md` satırı (⏳ ↔ ✅ / kaldır), ilgili spec dokümanı |

### Otomatik denetim

`pnpm docs:check` (`scripts/check-docs.mjs`, bağımlılıksız Node) şunları denetler ve CI'da koşar:
1. Markdown içindeki göreli linkler var olan dosyaya gider.
2. Dokümanlarda `` `apps/...` ``, `` `packages/...` ``, `` `contracts/...` ``, `` `docs/...` `` biçiminde geçen yollar var (belgelenmiş dosya silinmiş/taşınmışsa yakalar).
3. `apps/server/src/config/index.ts` şemasındaki her env değişkeni `architecture/server.md`'de anılır.
4. Her workspace paketi `architecture/packages.md` ya da `ARCHITECTURE.md`'de anılır.

Bu denetim **anlam** doğrulamaz (bir davranış değişikliğini yakalayamaz); yukarıdaki tablo ve inceleme yerine geçmez, yalnızca en sık bozulan yüzeyi (yollar/linkler/env/paketler) kapatır.

`pnpm secrets:check` (`scripts/check-secrets.mjs`, bağımlılıksız Node) izlenen dosyalarda checksum'ı geçerli Stellar secret seed'i (`S…`), `baret_…` API anahtarı ve PEM özel anahtarı arar, CI'da ayrı iş olarak koşar. Bilerek herkese açık bir anahtar (ör. showcase'in demo verici kimliği) aynı satıra ya da bir üst satıra `secret-scan: allow <neden>` yorumu konarak muaf tutulur.

## Doküman yazma ilkeleri

- **Doğrulanabilirlik:** iddianın yanına dosya yolu/işlev adı yaz. Emin değilsen "doğrulanmadı" yaz. Sayı (test sayısı, satır sayısı) yerine komut ver, çünkü sayılar çabuk bayatlar.
- **Durum dürüstlüğü:** uygulanmamış bir şeyi geniş zamanda ("yapar") anlatma; ⏳ olarak işaretle ve `implementation-status.md`'ye yaz.
- **Tek kaynak:** aynı bilgiyi birden çok yerde uzun uzun yazma; bir yerde anlat, diğerlerinden link ver. Kaçınılmaz çoğaltmalar (aynalar) `AGENTS.md`'de listelidir.
- **Ses:** dış metinler için [`positioning.md`](./positioning.md).
