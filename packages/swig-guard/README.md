# @stellar-thorn/swig-guard

The guard SDK: Baret's `GuardPolicy` type with the Strict / Balanced / Permissive templates, and a client for the analyze server's `POST /v1/analyze`. **It never signs and never submits**, and it does not depend on `@stellar/stellar-sdk` (it is bundled into the browser extension and the web wallet).
(The name is legacy: "swig" was a Solana wallet in an earlier version of the project.)

Where it sits and why it is separate: [`docs/architecture/packages.md`](../../docs/architecture/packages.md). The policy fields and where each is enforced: [`docs/policy-dsl.md`](../../docs/policy-dsl.md).

```ts
import { TransactionGuard, BALANCED_POLICY } from "@stellar-thorn/swig-guard";

const guard = new TransactionGuard({
  analyze: { baseUrl: "https://baret-stellar.onrender.com", apiKey: process.env.BARET_API_KEY },
  network: "testnet",
});

const ev = await guard.evaluate({ transactionXdr, userWallet: "G…", policy: BALANCED_POLICY });
if (ev.decision === "block") console.warn(ev.blockingReasons);   // ev.analysis has the full server verdict
// guard.prepare(...) throws GuardBlockedError instead of returning "block"
```

## API

- `TransactionGuard.evaluate(req)` → `{ decision: "allow" | "block", advisoryFindings, blockingReasons, analysis, transactionXdr }`; `prepare(req)` throws `GuardBlockedError` on a block.
- `analyzeTransaction(cfg, req)`: the raw client. Refuses a plain `http://` URL to a non-loopback host unless `allowInsecureHttp: true`; 15 s default timeout; errors are `AnalyzeError` (fail closed).
- `GuardPolicy`, `STRICT_POLICY`, `BALANCED_POLICY`, `PERMISSIVE_POLICY`, `POLICY_TEMPLATES`, `validatePolicy`, `normalizePolicy`.
- Types mirroring the server verdict: `AnalysisResult`, `RiskFinding`, `EstimatedChanges`, `VerdictAttestation`… (`src/types.ts`; keep in sync with `apps/server/src/domain/*`).

## Develop

```bash
pnpm build:guard                                # tsc → dist/ (consumers read dist/, build before typechecking them)
pnpm --filter @stellar-thorn/swig-guard test
```

Exports: `.` (everything) and `./policy`. Changing a policy field means updating the server schema, `docs/policy-dsl.md` and the extension's Policies page in the same change.
