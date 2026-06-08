# x4-dashboard

Opinionated React + Vite client for the `x4-api` REST API. Renders on a second
monitor as a browser tab against `http://127.0.0.1:8765`.

## Dev

```bash
pnpm install     # or npm/yarn — repo standardizes on pnpm
pnpm dev         # vite on :5173, proxies /api and /static to the API on :8765
```

## Codegen

The typed API client is **generated** from the API's OpenAPI schema. Never hand-edit
`src/lib/apiClient.ts`.

```bash
# from repo root:
pnpm --filter x4-dashboard codegen
```

See [`../../AGENTS.md`](../../AGENTS.md) for component patterns and the route page
catalog.
