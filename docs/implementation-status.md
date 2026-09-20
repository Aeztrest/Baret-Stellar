# Uygulama durumu: spec ↔ gerçek

> **Amaç:** `docs/` altındaki spec'ler (wallet-spec, x402-defense, policy-dsl, extension-architecture, vision) niyeti anlatır. Bu dosya
> **koda bakıp** hangisinin gerçekten var olduğunu söyler. Bir spec ile bu dosya çelişirse **bu dosya (ve kod) doğrudur**.
> Son doğrulama: 2026-09-19 (kaynak koda karşı). Bir özelliği eklerken/kaldırırken burayı güncelle.

Sözlük: ✅ uygulanmış · 🟡 kısmen · ⏳ planlanmış/kodda yok · 🗃️ eski (ürün dışı)

---

## 1. Sunucu

| Özellik | Durum | Not / kanıt |
|---|---|---|
| Pre-sign analiz pipeline'ı (decode → simüle → dedektör → policy → öneri) | ✅ | `application/analyze-transaction.ts` |
| Dedektörler (8 modül, aktif kodlar) | ✅ | `docs/architecture/server.md` §8; rezerve kodlar ⏳ (`GET /v1/detectors?status=reserved`) |
| Policy motoru (fail-closed alanlar) | ✅ | `policy/engine.ts` |
| Kural DSL'i + profiller (`strict`, `defi-permissive`, `monitor-only`) | 🟡 | Kod var, **ana yola bağlı değil**; `/v1/analyze` `policyProfile` kabul etmez, MCP `policyProfile`'ı yok sayar |
| Batch, SSE stream, decode | ✅ | `routes/batch.ts`, `routes/developer.ts` |
| `replay` | 🟡 | Yalnız **güncel** durumla yeniden simülasyon (`isHistorical:false`); Stellar tarihsel preflight sunmaz |
| Audit | 🟡 | Bellekte 10.000 kayıt, süreç geneli, anahtar bazlı ayrım yok, restart'ta sıfırlanır |
| Reputation DB | 🟡 | Tek örnek seed kayıt; hiçbir policy bayrağı `KNOWN_MALICIOUS_ADDRESS`'i bloklamaz |
| MCP | ✅ | 3 araç; `policyProfile` bağlı değil |
| API anahtarları (`POST /v1/keys`), anahtar başı limit, CORS, OpenAPI | ✅ | Kalıcılık host'a bağlı (ephemeral diskte kaybolur) |
| x402 analiz paywall'ı | ✅ | `X402_ENABLED` |
| x402 demo satıcı (`/demo/scrybe`, `/demo/cortex`) | ✅ | `X402_MERCHANT_SECRET` şart |
| İmzalı karar (attestation) | ✅ sunucu · ✅ `agent-guard` doğrulaması · ⏳ eklenti/showcase doğrulaması | `docs/x402-defense.md` §10 |
| Çok örnekli deploy için paylaşımlı rate limit | ⏳ | Sayaçlar süreç içi |

## 2. Eklenti (`apps/extension`)

### 2.1 Cüzdan çekirdeği

| Özellik | Durum | Not |
|---|---|---|
| Anahtar şifreleme (PBKDF2-SHA256 **600k** + AES-GCM), oturum sıfırlama, otomatik kilit (15 dk) | ✅ | Eski blob'lar unlock'ta yükseltilir (`needsIterationUpgrade`) |
| Kilit süresini kullanıcının ayarlaması | ⏳ | `idleTimeoutMs` sabit; popup "Auto-lock" satırı yalnız gösterir |
| Parola deneme sınırlayıcı (5 serbest, sonra üstel geri çekilme) | ✅ | `crypto/attempt-limiter.ts` |
| Çoklu hesap (HD, `m/44'/148'/i'`; hesap 0 eski ham seed) | ✅ | `crypto/hd.ts`; DB v4 hesap kapsamlı |
| İçe aktarma (mnemonic / S… / hex / base58) ve dışa aktarma | ✅ | `wallet.import`, `wallet.exportSecret` |
| Parola gücü göstergesi + yedek doğrulama sınavı (onboarding) | ✅ | `options/pages/Onboarding.tsx` |
| Passkey (WebAuthn) ile kurtarma/kilit açma | ⏳ | Smart wallet passkey-kit ile kuruluyor ama kullanıcı girişi parola; passkey enroll yok |
| Donanım cüzdanı | ⏳ | Kapsam dışı (vision) |
| Gerçek smart wallet deploy (passkey-kit, Ed25519 admin) | ✅ | `swig/provision.ts` (≥5 XLM gerekir) |
| Popup sekmeleri Home / Activity / Allowances / Settings | ✅ | |
| Options sayfaları Home / Sites / Activity / Policies / x402 Console / Anchors / Settings | ✅ | **Options'ta ayrı "Allowances" sayfası yok**; allowance'lar Sites/SiteDetail ve x402 konsolunda |
| Gönder (XLM) / Al / Airdrop (Friendbot) / USDC trustline ekle | ✅ | Gönder authority `G…` hesabından yapılır |
| "Swap" hızlı eylemi | ⏳ | Yok (wallet-spec'te placeholder deniyordu, kodda hiç yok) |
| CSV dışa aktarma, tarih/tutar filtreleri, toplu yeniden analiz | ⏳ | Yok |
| Telemetri/bildirim ayar sayfaları, özel RPC URL'i | ⏳ | Yok. Bildirimler (drift, oto-onay) kodda var ama ayarsız |
| Hesap tema (light/dark) | ✅ | `ThemeProvider`/`ThemeToggle` |
| Sayfada köşe rozeti (Shadow DOM overlay) | ✅ | `content/ui/BaretOverlay.tsx`, origin başına gizlenebilir |

### 2.2 Sağlayıcı ve imza

| Özellik | Durum | Not |
|---|---|---|
| Freighter uyumlu sağlayıcı `window.baretStellar` (`isConnected/requestAccess/getAddress/getNetwork/signTransaction/signAuthEntry/signMessage`) | ✅ | `inpage/wallet-standard.ts` |
| Gerçek **Wallet Standard** `registerWallet` kaydı | ⏳ | Dosya adı yanıltıcı; yalnız `window.baretStellar` + `baret:walletReady` olayı var. Showcase bunu kendi köprüsüyle bulur |
| `signAndSendTransaction` sağlayıcıda | 🟡 | Background `ws.signAndSendTransaction` var; **inpage sağlayıcı bunu sunmuyor** (showcase `signTransaction` + kendi Horizon gönderimiyle düşer) |
| Connect izni (per-origin, "her zaman güven") | ✅ | `db/site-permissions.ts` |
| Pre-sign analiz popup'ı (Safe/Caution/Blocked, "1,5 sn basılı tut" override) | ✅ | `popup/SignRequest.tsx` |
| Analiz sunucusuna ulaşılamayınca "korumasız imza" advisory: Retry düğmesi, imza için 1,5 sn basılı tutma, 45 sn zaman aşımı, 6 sn sonra "sunucu uyanıyor" ipucu, `ws.connect`'te ısıtma isteği | ✅ | `analyze-client.ts` (`offline:true`, `warmUpAnalyzer`), `popup/SignRequest.tsx` |
| `tx.send` RPC | ⏳ | `notImplemented` |
| SEP-10 challenge tanıyıcı: geçerli girişi "para hareket etmez" diye gösterir; sahte challenge (sıfır olmayan sequence, `manage_data` dışı op, yanlış imza/`SIGNING_KEY`, farklı hesap) **bloklar**; allowlist dışı anchor uyarıdır | ✅ | `sep/sep10-challenge.ts`, `sep/anchors.ts`, `sep/toml.ts`; `tx.analyzeRequest` sunucudan önce çağırır. Yalnız `tr-mock-anchor.fly.dev` allowlist'te; çekme koruması ⏳ (`PLAN.md` T2.4) |
| Anchor'ın bildirdiği varlık için trustline istisnası (Balanced'ın limitsiz-trustline kuralı ve Strict'in trustline kuralı, yalnız canonical USDC / anchor toml `CURRENCIES` varlığının eklenmesi için kapatılır) + Options → Anchors "Account setup" paneli | ✅ | `sep/trustline-exception.ts`, `tx.analyzeRequest`, `options/pages/AnchorPage.tsx` |
| SEP-6 çekme koruması: anchor'ın `ACCOUNTS`'undaki bir hesaba giden ödeme, anchor'ın kendi talimatıyla (`/sep6/transactions`) birebir eşleşen **tek** `payment` değilse bloklanır; talimat doğrulanamıyorsa (girişsiz, anchor erişilemez, kayıt yok) fail-closed bloklanır | ✅ | `sep/withdraw-guard.ts`, `sep/withdraw-verify.ts`, `sep/sep6-transactions.ts`; `tx.analyzeRequest`. Baret'in kendi çekme başlatma/ödeme akışı ⏳ (`PLAN.md` T2.4 ikinci kısım) |
| Anchor girişi (Options → Anchors): SEP-10 challenge'ı **kendisi doğrulamadan imzalamaz**; JWT yalnız service worker belleğinde, kilitlenince silinir; SEP-6 `/info` gösterilir | ✅ | `sep/sep10-login.ts`, `sep/session.ts`, `sep/sep6-info.ts`, `sep/anchor-service.ts`, `options/pages/AnchorPage.tsx`. Yatırma/çekme, işlem kayıtları ve çekme koruması ⏳ (`PLAN.md` T2.4, T2.5) |
| Auth-entry ground-truth çözümü (sayfanın yalanına karşı) | ✅ | `parseTransferAuthEntry`; asset allow-list ihlali **bloklu** verdict |
| Eklentinin sunucu API anahtarı | 🟡 | `dev-key-change-me` **koda gömülü** (`messaging/handlers.ts`); yapılandırılamaz |

### 2.3 x402

| Özellik | Durum | Not |
|---|---|---|
| 402 yakalama (fetch interceptor) + `signAuthEntry` doğrudan yolu | ✅ | İkisi de aynı mandate kuralına uyar |
| Doğrulama: scheme, network, C…/G… adresleri, `maxTimeoutSeconds` (**≤ 600**), `sponsorBy`/`feePayer` | ✅ | `x402/parse.ts`. (Spec'te ≤ 300 yazıyordu, kod 600) |
| Asset / merchant origin / facilitator allow-list'leri | ✅ | `policy.allowedAssets/allowedMerchantOrigins/blockedMerchantOrigins/allowedFacilitators` |
| Mandate modeli: ilk ödeme elle onay, canlı mandate ile oto-onay, süre sonu = yeniden onay | ✅ | `db/allowances.ts` `promoteAllowance`, `mandateMaxAgeDays` (varsayılan 30) |
| Per-tx / saatlik / günlük **kayan pencere** tavan, atomik rezervasyon | ✅ | `tryReserveSpend` |
| Oto-onayda OS bildirimi | ✅ | `notifyAutoApproved` |
| **Zincir üstü** alt anahtar (MerchantSpendPolicy) | ✅ kodda · ⚠️ canlı doğrulama | Ayrıntı aşağıda §4. Best-effort: başarısızsa admin anahtarıyla imzalanır |
| Pause = yalnız yerel; Revoke = zincirde `remove_signer` | ✅ | `ledger.pause` zincire dokunmaz |
| Facilitator `/supported` çapraz kontrolü (`requireFeePayerSupportedCheck`) | ⏳ | Alan şemada/UI'da var, **kodda uygulanmıyor** |
| Tutar anomali tespiti (`blockAmountAnomalies`, `anomalyStdDev`) | ⏳ | Alan var, uygulanmıyor |
| Memo tekrar kontrolü | ⏳ | Soroban işlemleri memo taşıyamaz; x402 Stellar şemasında anlamsız |
| `timeBounds` tazelik tavanı (`maxTimeBoundsWindowSeconds`) | ⏳ | Alan var, uygulanmıyor (imza süresi auth-entry `signatureExpirationLedger` ile sınırlı) |
| Settle-ama-teslim-yok / verify-orphan gözcüsü, `cap_hit` alarmı | ⏳ | `AlertEntry.kind` tipinde var, **hiçbir yer üretmiyor** |
| Otomatik iptal/duraklatma (`autoRevokeAfterIdleDays`, `autoPauseOnDailyCapHit`) ve `maxActiveSubKeys` | ⏳ | Alanlar var, uygulanmıyor |
| Sunucuda `POST /v1/x402-analyze`, `GET /v1/facilitator-status`, programatik alt anahtar isteği | ⏳ | Spec'te vardı; **yok** (bunun yerine `/v1/analyze` `paymentRequirements` kabul eder) |

### 2.4 İzleme

| Özellik | Durum | Not |
|---|---|---|
| Post-sign monitör | 🟡 | **Horizon polling (8 sn)**, WebSocket değil; authority + smart wallet adreslerinde. Bilinmeyen işlem → `drift` alarmı + bildirim |
| `chrome.alarms` ile yeniden bağlanma/`reconcile` | ⏳ | `alarms` izni manifestte var, kodda kullanılmıyor |
| IndexedDB `monitor`, `prefs` mağazaları | ⏳ | Şemada oluşturuluyor, **kullanılmıyor** (monitör imleci `storage.local`'da) |

## 3. Policy alanları: nerede uygulanıyor

`GuardPolicy` (`packages/swig-guard/src/policy.ts`) 40'a yakın alan içerir. Uygulama yeri:

| Grup | Alanlar | Uygulayan |
|---|---|---|
| Pre-sign (sunucu) | `maxLossPercent`, `minPostUsdcBalance`, `minPostAsset`, `blockTrustlineChanges`, `blockUnlimitedTrustlines`, `blockSorobanAllowanceGrants`, `blockRiskyContracts`, `blockUnknownContractExposure`, `blockAccountMerge`, `blockSignerChanges`, `blockMasterKeyRemoval`, `allowWarnings`, `requireSuccessfulSimulation`, `requireMemo`, `maxResourceFeeStroops`, `maxBaseFeeStroops`, `allowedAssets` | ✅ Sunucu (`policy/engine.ts`, dedektörler). Eklenti bunları `/v1/analyze`'a yollar |
| x402 (eklenti) | `x402AutoApprove`, `maxX402PerTx`, `x402HourlyCap`, `x402DailyCap`, `allowedAssets`, `allowedFacilitators`, `allowedMerchantOrigins`, `blockedMerchantOrigins`, `mandateMaxAgeDays` | ✅ Eklenti (`x402/handlers.ts`, `wallet-standard/handlers.ts`) |
| Tanımlı + UI'da var, **uygulanmıyor** | `requireFeePayerSupportedCheck`, `blockAmountAnomalies`, `anomalyStdDev`, `autoRevokeAfterIdleDays`, `autoPauseOnDailyCapHit`, `maxActiveSubKeys`, `refuseUnlimitedAllowances`, `driftAlerts` (monitör her zaman açık), `verifyOrphanAlerts`, `noDeliveryAlerts`, `refuseInAlertState`, `maxTimeBoundsWindowSeconds` | ⏳ |

Ayrıntı ve şema: [`policy-dsl.md`](./policy-dsl.md).

## 4. Zincir üstü alt anahtar (MerchantSpendPolicy)

Kod tarafı **tam**: kontrat + 14 birim testi (`contracts/`), eklentide `swig/sub-keys.ts` (`ensurePolicyInstalled`, `provisionMerchantSubKey`), `swig/sub-key-lifecycle.ts#refreshSubKeyAfterApproval`,
`x402/handlers.ts#resolvePaymentSigner`. Eski dokümanlardaki "tavan zincirde uygulanmıyor" ifadesi **artık yanlıştır** (bkz. `LIMITATIONS.md`, `docs/x402-defense.md` §11).

Bu dokümanı yazarken **yapılmayan**: canlı testnet'te uçtan uca doğrulama (`contracts/contracts/merchant-spend-policy/DEPLOYMENT.md` "End-to-end verification" kontrol listesi) yeniden koşturulmadı. Bu yüzden garanti
"kodda ve birim testlerinde var; canlı doğrulama için o listeyi çalıştır" olarak okunmalıdır. Sınırlar:
- Provisioning **best-effort ve elle onay sonrası** (ilk onay, süresi dolan mandate'in yenilenmesi, ya da alt anahtarı olmayan merchant için yeniden deneme); başarısızsa (RPC, parola önbelleği 5 dk TTL) o merchant admin anahtarıyla imzalanır, zincir tavanı yoktur ve Activity'de uyarı çıkar.
- Alt anahtar `SignerLimits` ile **tek token kontratına** bağlıdır (mandate'in `asset`'i); token'ı farklı bir merchant/asset çifti yeni satır/yeni alt anahtar gerektirir.
- Zincir tarafında `pause` çağrılmaz (yalnız yerel), `revoke` signer'ı kaldırır ama politikadaki `Allowance` satırı TTL ile kendiliğinden ölür.
- **Mandate yenileme (düzeltildi, 2026-09-20):** Zincirdeki `set_allowance` süresi ve alt anahtarın `Temporary` signer süresi mandate ile birlikte dolar; yerel satırın `status`'ü ise `"active"` kaldığı için eski kod yenilemede hiçbir şey kurmuyordu ve eklenti süresi dolmuş alt anahtarı kullanmaya devam ediyordu. Artık `txSignHandler` onaydan **önce** mandate'in canlı olup olmadığını okur ve `refreshSubKeyAfterApproval` mandate lapsed ise (ya da merchant'ın alt anahtarı yoksa) yeni bir alt anahtar kurar, eskisini yerelde `revoked` yapar. Kurulum başarısız olursa eski anahtar da emekliye ayrılır (ödemeler admin anahtarına düşer) ve Activity'de uyarı çıkar. Canlı yenileme yalnız birim testleriyle doğrulandı (`sub-key-lifecycle.test.ts`, `tx-sign-mandate.test.ts`), testnet'te **koşturulmadı**.

## 5. Bağımsız cüzdan, showcase

| Özellik | Durum | Not |
|---|---|---|
| `apps/wallet` gerçek smart wallet | ⏳ | `smartWalletAddress` = authority adresi (yer tutucu) |
| `apps/wallet` x402/mandate/alt anahtar | ⏳ | Yok (yalnız eklentide) |
| `apps/wallet` ağ seçimi | ⏳ | `ACTIVE_NETWORK="testnet"` sabit |
| Showcase pubnet | ⏳ | Testnet-only |
| Showcase'te sayfa içi analiz kutusu | ⏳ (kaldırıldı) | Bilerek: verdict yalnızca cüzdan popup'ında |
| Kurmaca dApp rakamları etiketli, Scrybe'de sahte sayaç/akış yok | ✅ | `apps/showcase/src/components/SiteShell.tsx` ("Fictional demo dApp" rozeti), `apps/showcase/src/sites/scrybe/Scrybe.tsx` |

## 6. Kontratlar

| Kontrat | Durum |
|---|---|
| `merchant-spend-policy` (multi-tenant, `PolicyInterface`) | ✅ testnet: `CCWTPB4F…SQ2DHQ5S`, wasm `122e762a…f3b834`, 14 test |
| `payment-guard` (custodial vault) | 🗃️ Ürün dışı; kodu ve 26 testi duruyor; testnet'teki v2 bayat (v3 yeniden deploy edilmedi) |
| Mainnet | ⏳ |

## 7. Dağıtım ve dokümantasyon

| Özellik | Durum |
|---|---|
| Chrome Web Store / AMO | ⏳ (unpacked/geçici) |
| Sunucu Render free, showcase Vercel | ✅ |
| `docker compose` | 🟡 Dockerfile filtre adı düzeltilmiş görünüyor (çalışma ağacında); `frozen-lockfile` + kısmi manifest kopyası ile derlemenin çalıştığı **doğrulanmadı** |
| `baret_docs` deploy tanımı | ⏳ (CI yalnız lint+build ediyor) |
