# @stellar-thorn/server

Baret's HTTP backend: pre-sign transaction analysis for Stellar, the developer API (keys, OpenAPI), x402 paywall/merchant demos and MCP tools.
Fastify 5 + TypeScript, single process, **one network** (testnet or pubnet).

**Internals:** [`docs/architecture/server.md`](../../docs/architecture/server.md) (Turkish). **HTTP contract:** live `GET /openapi.json`. **Big picture:** [`ARCHITECTURE.md`](../../ARCHITECTURE.md).

## Run

```bash
cp apps/server/.env.example apps/server/.env      # testnet defaults; only the two Stellar URLs are required
pnpm dev:server                                    # tsx watch → http://localhost:8080
pnpm --filter @stellar-thorn/server x402-setup     # once: merchant key + testnet funding (for /demo/scrybe, /demo/cortex)
```

Other scripts (from this directory or via `pnpm --filter @stellar-thorn/server`): `test` (vitest, offline), `lint` (`tsc --noEmit`), `build` (`tsc -p tsconfig.build.json` → `dist/`), `start` (`node dist/index.js`).

## Try it

```bash
curl -s localhost:8080/health                                   # {"status":"ok"}
KEY=$(curl -s -X POST localhost:8080/v1/keys -H 'content-type: application/json' -d '{"name":"dev"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).key')
curl -s localhost:8080/v1/analyze -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"network":"testnet","transactionXdr":"<base64 envelope>","userWallet":"G…","policy":{"blockAccountMerge":true}}'
```

## Layout

`src/app.ts` (hook order, error handling, route registration) · `src/api/` (auth, CORS, errors, OpenAPI, routes) · `src/application/analyze-transaction.ts` (pipeline) ·
`src/simulation/`, `src/analysis/`, `src/risk/`, `src/policy/`, `src/domain/` · `src/keys/` · `src/attestation/` · `src/x402/`, `src/infra/x402.ts` · `src/mcp/` · `src/data/` · `test/`.
Full map with responsibilities: `docs/architecture/server.md` §1.

## Things to know

- Env prefix `DELTAG_*` is the server's old name; it is still required (`DELTAG_API_KEYS`, …). New settings use `BARET_*`.
- `/v1/*` and `/mcp/*` are closed by default; open a route only by listing it in `PUBLIC_ROUTES` (`src/api/auth.ts`).
- Adding a route means: implement it, describe it in `src/api/openapi.ts` (a test enforces it), add it to the portal catalog `apps/showcase/src/pages/developers/endpoints.ts` and to `baret_docs`.
- An empty `policy` blocks failed simulations and incomplete data. A finding blocks only when its policy flag is on.
- Issued API keys are stored in `BARET_DATA_DIR/keys.json`; on ephemeral disks they disappear on restart.
- `Dockerfile` (compose file at the repo root) builds the server; see `DEPLOY.md` for its caveats.
