---
name: dev-mode
description: Run DevHub in mock mode (no real DB/auth/external services) for visual tests, logic tests, and verification workflows with browser automation. Use when asked to run, test, screenshot, or verify the app locally.
---

# DevHub Dev Mode (Mock Mode)

Boots the full app with zero real dependencies: an embedded local Postgres
(`prisma dev`), real better-auth sessions from seeded personas, and every
external service (Linear, Resend, Upstash, Discord, Roblox, FinSys, Billplz,
Xendit, Vercel Blob) answered by in-process mocks.

## Boot

```bash
pnpm dev:mock          # start DB + push schema + seed (first run) + next dev
pnpm dev:mock:reset    # wipe DB, re-push, re-seed (see Reset caveat below)
pnpm dev:mock:seed     # everything except starting next dev
pnpm dev:mock:stop     # stop the local prisma-dev server
```

Boot is verified when the server logs `[dev-mode] Outbound fetch interceptor
installed` and `Blob mock API listening`. Sanity-check interception any time
via `GET http://localhost:3000/api/dev/debug` (expects a mock Linear token in
`probe`).

**IMPORTANT — restart after editing `src/dev/**` or `src/instrumentation.ts`.**
The fetch interceptor is installed once at boot; HMR does not reliably reload
it and requests may silently reach real APIs (the safety assertion keeps the
DB local, but don't trust a hot-reloaded interceptor). `Ctrl-C` + `pnpm
dev:mock` is cheap (~5s warm).

## Personas (log in by URL — ideal for browser automation)

| URL | Lands on | Who |
|---|---|---|
| `/api/dev/login?as=developer` | `/dashboard` | Alex Developer — rich history: active PPTs, bonuses, incentives, KYC approved, auto-payout on |
| `/api/dev/login?as=admin` | `/dashboard` | Aina Admin — ADMIN role, all `/dashboard/admin/*` pages |
| `/api/dev/login?as=fresh` | `/onboarding` | Farah Fresh — no profile, exercises onboarding |

Append `&redirect=/dashboard/ppts` to land elsewhere. Sessions are real
better-auth sessions; password for manual sign-in is `devhub-mock-password`.

## Simulate events (signed with the committed fake secrets in .env.mock)

```bash
pnpm simulate linear --issue MYS-201 --action complete   # Linear webhook (Issue)
pnpm simulate linear --issue MYS-201 --action comment    # proof comment webhook
pnpm simulate linear --issue MYS-220 --action reopen     # reopen a paid issue
pnpm simulate billplz [--status completed|failed]        # provider webhook → latest PROCESSING payout
pnpm simulate xendit  [--status COMPLETED|FAILED]
pnpm simulate cron <billplz-poll|xendit-poll|kyc-cleanup|incentives-weekly|incentives-release|ppt-admin-digest|ppt-eligibility>
```

Full PPT payout lifecycle (verified working): `complete` → `comment` (proof)
→ auto-approved transaction + Billplz order → `cron billplz-poll` twice (mock
flips status on 2nd read) → payout COMPLETED, tx PAID, PDF slip stored, email
recorded in EmailDelivery. `PPT_STABILITY_MINUTES=0` in .env.mock makes this
instant.

## Verify

```bash
pnpm smoke       # logs in as each persona, fetches all key routes, asserts 200
pnpm typecheck   # prisma generate && tsc --noEmit (catches seed/fixture drift)
```

`POST /api/dev/reset` restores in-memory mock state (Linear workspace,
provider orders, blobs) to the seeded baseline and revalidates caches; DB
rows survive. `GET /api/dev/reset` shows mock-state counts. After a reset,
re-hit `/api/dev/login` (the 5-min session cookie cache may be stale).

## Reset caveat for AI agents

`pnpm dev:mock:reset` runs `prisma db push --force-reset`, which the Prisma
CLI **blocks when invoked by an AI agent** until the user explicitly consents
(it prints instructions). Run by a human it works directly. Agents needing a
fresh DB should ask the user to run it, or seed-compatible state can usually
be reached via `/api/dev/reset` + simulate commands instead.

## Architecture (what to update when the codebase changes)

| Change | Update |
|---|---|
| New Prisma model / page needing data | `prisma/seed.ts` (typed — tsc catches drift) + route in `scripts/dev/smoke.ts` |
| New external HTTP call | handler in `src/dev/handlers/`, ROUTES entry in `src/dev/intercept.ts` (unhandled hosts throw with instructions) |
| New Linear query/mutation | `src/dev/handlers/linear.ts` (unknown operations throw with the operation name) |
| New env var | fake value in `.env.mock` (it must enumerate everything so real values can't leak in) |
| New Linear-derived DB rows | ids from `src/dev/fixtures/linear.ts` — the single source shared by seed, mocks and simulators |

Key files: `.env.mock` (committed fake env), `src/lib/dev-mode.ts` (flags +
safety assertions), `scripts/dev/dev-mock.ts` (orchestrator),
`src/dev/intercept.ts` (fetch interception), `src/dev/state.ts` (in-memory
mock state on globalThis), `src/dev/blob-server.ts` (Vercel Blob mock on
:4983), `prisma/seed.ts`.
