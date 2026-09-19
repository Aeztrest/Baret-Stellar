# Paketler (`packages/*`)

> Koddan doğrulanmıştır (2026-09-19). Genel resim: [`ARCHITECTURE.md`](../../ARCHITECTURE.md). Her paketin kendi
> `README.md`'si de vardır; burada paketlerin **birbirine nasıl bağlandığı ve neden ayrı oldukları** anlatılır.

## Bağımlılık grafiği

```
                    ┌──────────────────────┐
                    │ @stellar-thorn/ui    │  (React tasarım sistemi; framework: Radix + Tailwind token'ları)
                    └─▲────▲───────▲───────┘
                      │    │       │
   ┌──────────────────┘    │       └─────────────────────┐
   │                       │                             │
apps/extension        apps/wallet                   apps/showcase ──► showcase-ui
   │  │  │                 │  │                          │  │  │
   │  │  └► ext-protocol   │  └► wallet-adapter          │  └► swig-guard (yalnız AgentsPage policy şablonları)
   │  │                    │                             │
   │  └────────► swig-guard ◄───────────────────────────┘   (showcase package.json'da wallet-adapter de
   │                 ▲                                       tanımlı ama kodda import EDİLMİYOR)
   │                 │
   │        packages/agent-guard ──► @stellar/stellar-sdk (doğrudan)
   └► passkey-kit, passkey-kit-sdk, @stellar/stellar-sdk

apps/server: workspace paketlerine BAĞIMLI DEĞİL (kendi domain tiplerini taşır; swig-guard/types.ts bunun aynasıdır)
```

Kural: **`swig-guard` Stellar SDK'sına bağlanmaz** (yalnızca `devDependency`), `ext-protocol` ve `wallet-adapter` sıfır çalışma zamanı bağımlılığına sahiptir.

## `@stellar-thorn/swig-guard` (`packages/swig-guard`)

Guard SDK'sı. Ne yapar:
- **`GuardPolicy`** tipi + `STRICT_POLICY` / `BALANCED_POLICY` / `PERMISSIVE_POLICY` + `POLICY_TEMPLATES` + `validatePolicy()` / `normalizePolicy()` (`src/policy.ts`).
- **`analyzeTransaction(cfg, req)`** (`src/analyze.ts`): `POST {baseUrl}/v1/analyze`, `Authorization: Bearer <apiKey>`. `assertSecureBaseUrl` düz `http://` adresini loopback dışında reddeder
  (`allowInsecureHttp` ile aşılır). Zaman aşımı 15 sn. Hata → `AnalyzeError`.
- **`TransactionGuard`** (`src/guard.ts`): `evaluate()` **asla imzalamaz/göndermez**, `decision: "allow" | "block"` döner; `prepare()` blokta `GuardBlockedError` fırlatır.
- **Tipler** (`src/types.ts`): sunucu `Decision`'ının aynası (`AnalysisResult`, `RiskFinding`…). `RiskSeverity` burada `critical` da içerir; sunucu yalnız `low|medium|high` üretir.
- Export haritası: `.` (hepsi) ve `./policy`. Tüketiciler `dist/`'i kullanır, bu yüzden **önce build edilmeli** (`pnpm build:guard`).

Neden ayrı ve SDK'sız: eklenti ve bağımsız cüzdan paketine girer; tarayıcı paketini şişirmemek için.

## `@stellar-thorn/agent-guard` (`packages/agent-guard`)

`swig-guard` üzerine "pilleri dahil" katman: anahtar tutma + imzalama + Horizon'a gönderme.
- **`AgentWallet`** (`src/agent.ts`): `evaluate` (imzalamaz), `guardedSign`, `guardedSubmit`. Fail-closed; `allowOffline` bilinçli istisna (sonuç `bypassedOffline:true` taşır).
- **`config.ts`**: katmanlı config (açık seçenek → env `BARET_*` → `~/.baret/config.json` → varsayılan). **Agent secret asla dosyaya yazılmaz**, API anahtarı CLI bayrağıyla da verilmez (yalnız `BARET_API_KEY`).
  Env'ler: `BARET_API_URL`, `BARET_API_KEY`, `BARET_NETWORK`, `BARET_POLICY`, `BARET_HORIZON_URL`, `BARET_AGENT_SECRET`, `BARET_PINNED_SERVER_PUBLIC_KEY`.
- **`attestation.ts`**: `verifyVerdictAttestation`. `pinnedServerPublicKey` verilirse `evaluate()` yanlış/eksik imzada `AttestationError` fırlatır (fail-closed). Sunucudaki `sign-verdict.ts` ile **birebir aynı** kanonik payload'ı kullanır; birini değiştirirsen ikisini değiştir.
- **`cli.ts`** → `baret` ikilisi (`analyze | sign | submit | address | init | policy list`; `<xdr>` yerine `-` = stdin; `--json`). Çıkış kodları: `0` izin, `1` policy bloğu, `2` hata.
- `swig-guard` tiplerini/şablonlarını yeniden export eder (tek import).
- Sunucu URL'i varsayılanı `http://localhost:8080` (`DEFAULT_SERVER_URL`).

## `@stellar-thorn/wallet-adapter` (dizin: `packages/baret-adapter`)

dApp ↔ **bağımsız web cüzdanı (`apps/wallet`)** popup köprüsü. `BaretAdapter` bir popup penceresi açar (`/connect`, `/sign`), `window.postMessage`
ile el sıkışır (`popup-ready` → `connect-request`/`sign-request` → `connect-approved|rejected`, `sign-approved|rejected`), tüm mesajlar `__bt: "1"` etiketlidir.
`connect()`, `signTransaction(xdr)`, `signAndSendTransaction(xdr)`, `disconnect()`. Taşıma XDR string'idir; paketin çalışma zamanı bağımlılığı yoktur.
**Eklenti bunu kullanmaz** (eklentinin kendi `window.baretStellar` sağlayıcısı vardır). Gerçek kullanan: `apps/wallet` (popup tarafı: `Connect.tsx`, `Sign.tsx`). `apps/showcase` `package.json`'da bağımlılık olarak listeler ama kodunda import etmez (showcase kendi `wallet/standard-bridge.ts`'iyle `window.baretStellar`/Freighter'a bağlanır); `vercel.json` yine de build sırasına dahil eder.

## `@stellar-thorn/ext-protocol` (`packages/ext-protocol`)

Eklenti yüzeyleri arası **tek doğruluk kaynağı** (yalnız tipler + 2 küçük yardımcı; `src` doğrudan export edilir, derleme adımı yok):
- `Envelope` (`__bx: 1`, `id`, `kind: req|rsp|evt`, `method`, `payload`), `isEnvelope`, `newRequestId`.
- `ExtRpc`: popup/options ↔ background RPC kayıt defteri (`wallet.*`, `tx.*`, `ledger.*`, `policy.*`, `history.*`, `alerts.*`, `sitePermissions.*`, `network.set`).
- `ExtEvents`: `state.changed`, `alert.new`, `ledger.tick`, `tx.signRequest`, `tx.signed`.
- `ExtWalletStandardMethods` (`ws.*`) ve `ExtX402Methods` (`x402.review`): content script portları.
- Alan tipleri: `WalletStateSnapshot`, `AccountSnapshot`, `AllowanceSnapshot`, `AnalyzeResponse`, `X402MandatePreview`…
Yeni RPC eklemek = önce buraya, sonra `background/messaging/handlers.ts`'e. (`handlers` nesnesi `{[M in ExtRpcMethod]: Handler<M>}` olduğundan eksik handler derlenmez.)

## `@stellar-thorn/ui` (`packages/ui`)

Tek görsel kimlik kaynağı. `src/tokens.css` renk/tipografi/radius **token'larıdır** (dark set `.dark` bloğunda), `src/primitives/*` (Button, Badge, Card, Verdict, Meter, StatTile,
CompareSplit…), `src/shadcn/*` (`Sh*` önekli Radix sarmalayıcılar), `src/motion/*`, `src/layout/*`, `src/theme/*`, `src/brand/Mark.tsx` (**hard hat** logosunun tek kaynağı), `src/hooks/usePolling.ts`.
Uygulamalar `@stellar-thorn/ui/tokens.css`'i giriş noktasında içe aktarır. `baret_docs` bunu import **edemez** (React 19 vs peer React 18); token değerlerini kendi Tailwind `@theme`'ine elle kopyalar.
Tasarım kuralları: [`docs/brand.md`](../brand.md).

## `@stellar-thorn/showcase-ui` (`packages/showcase-ui`)

Demo sitelere özgü küçük ortak parçalar (şimdilik yalnızca `DangerModeToggle`; ClaimHub, LaunchPad ve diğerleri kullanır). Cüzdanın tasarım sistemine ait olmayan demo-senaryo kavramları burada durur.

## Derleme sırası ve komutlar

`swig-guard` ve `wallet-adapter` (ve `agent-guard`) `dist/` üretir; tüketiciler onu okur. Sıfırdan kurulumda:

```bash
pnpm install
pnpm build:guard && pnpm --filter @stellar-thorn/wallet-adapter build   # ext/showcase/wallet typecheck için gerekli
pnpm build:agent-guard                                                  # CLI (dist/cli.js) için
pnpm typecheck                                                          # tüm workspace
```

CI (`.github/workflows/ci.yml`) bunu `pnpm -r --if-present build → typecheck → lint → test` ile yapar. `lint` yalnızca sunucuda tanımlıdır, `test` sunucu, eklenti, cüzdan ve `packages/{swig-guard,agent-guard,baret-adapter,ext-protocol}`'te.
