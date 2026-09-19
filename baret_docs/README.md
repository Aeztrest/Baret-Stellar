# baret_docs

The public **API documentation site** for Baret's analyze API: quickstart, authentication, the analyze / batch / stream / decode / replay / audit endpoints, the risk-detector reference, the policy options, errors and SDKs.
Next.js 16 + MDX, derived from the Tailwind Plus "Protocol" template. It is **outside the pnpm workspace** and has its own `package-lock.json` (use `npm`).

The pages describe the behaviour of `apps/server`. The machine-readable source is the live `GET /openapi.json`; the code map is [`docs/architecture/server.md`](../docs/architecture/server.md). When an endpoint, field, error code or finding changes, update the matching page here.

## Run

```bash
cd baret_docs
npm install            # or npm ci
npm run dev            # http://localhost:3000
npm run lint
npm run build          # CI runs lint + build
```

## Content

| Page | File |
|---|---|
| Introduction, Quickstart, Authentication | `src/app/page.mdx`, `quickstart/`, `authentication/` |
| Risk Detectors (generated from the server's catalog; live list at `GET /v1/detectors`), Policy, Errors, SDKs | `detectors/`, `policies/`, `errors/`, `sdks/` |
| Analyze, Batch, Stream, Decode, Replay, Discovery, Audit | `analyze/`, `batch/`, `stream/`, `decode/`, `replay/`, `discovery/`, `audit/` |

- New page: add `src/app/<slug>/page.mdx` and a link in `src/components/Navigation.tsx` (`navigation`). Each page may export `sections` (right-hand outline) and must use only the MDX components in `src/components/mdx.tsx` (`Note`, `Row`, `Col`, `Properties`, `Property`, `Button`, `CodeGroup`).
- In MDX prose put anything with braces or angle brackets inside backticks; they are otherwise parsed as JSX.
- **Wrap every fenced code block in `<CodeGroup>`** (even a single one; `<CodeGroup>` with no `tag`/`label` is fine). A bare fence is rendered through the template's `Pre` fallback, which in some pages fails at render time with `React.Children.only expected to receive a single React element child` (seen in `next build` prerendering, not in every page; the trigger was not pinned down). Grouped fences build reliably.
- Examples use the hosted testnet demo server `https://baret-stellar.onrender.com`; keep example responses consistent with the real server (see `apps/showcase/src/pages/developers/endpoints.ts` for real captured output).
- `src/components/Libraries.tsx` and `CHANGELOG.md` are leftovers of the template (unused / the template's own history).
- Design tokens are mirrored by hand from `@stellar-thorn/ui` (React 19 here vs React 18 there); keep them in sync.

## License

The template is licensed under the Tailwind Plus license (`LICENSE.md`).
