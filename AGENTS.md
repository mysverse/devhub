# AGENTS.md

This file provides guidance to coding agents when working in this repository.

## Commands

```bash
pnpm dev                    # Start the Next.js dev server (needs real env vars)
pnpm dev:mock               # Start in dev mode: local DB + seeded data + mocked services
pnpm build                  # Production build; runs prisma generate first
pnpm start                  # Start the production server
pnpm lint                   # Run Biome lint with auto-fix
pnpm check                  # Run Biome check with auto-fix
pnpm typecheck              # prisma generate && tsc --noEmit
pnpm smoke                  # Dev-mode route sweep (requires pnpm dev:mock running)
pnpm simulate <...>         # Dev-mode webhook/cron simulators (see Dev Mode below)
pnpm exec prisma validate   # Validate the Prisma schema
pnpm exec prisma generate   # Regenerate Prisma client after schema changes
pnpm exec prisma migrate dev # Create/apply development migrations
```

`pnpm build` needs production-like secrets available. In local verification it may fail during page-data collection if required env vars such as KV, Better Auth, Resend, or provider credentials are missing.

## Dev Mode (mock environment)

`pnpm dev:mock` runs the full app with **zero real dependencies** — an
embedded local Postgres (`prisma dev`, no Docker), seeded data, real
better-auth sessions, and all external HTTP (Linear, Resend, Upstash,
Discord, Roblox, FinSys, Billplz, Xendit, Vercel Blob) answered by mocks in
`src/dev/`. Use it for visual/logic testing and browser automation. Full
runbook: `.claude/skills/dev-mode/SKILL.md`.

- Login by URL: `/api/dev/login?as=developer|admin|fresh`. Password for the
  sign-in form: `devhub-mock-password`.
- `pnpm dev:mock:reset` wipes and re-seeds; `pnpm simulate
  linear|billplz|xendit|cron` fires signed webhooks/crons that exercise the
  real verification code paths.
- Restart `pnpm dev:mock` after editing `src/dev/**` or
  `src/instrumentation.ts` — the fetch interceptor installs once at boot and
  HMR does not reliably reload it.

**Drift contract — when you change the codebase, keep dev mode true:**

| Change | Also update |
|---|---|
| New Prisma model or page that needs data | `prisma/seed.ts` (typed against the real client — `pnpm typecheck` catches drift) and the route list in `scripts/dev/smoke.ts` |
| New outbound HTTP call / external service | handler in `src/dev/handlers/` + ROUTES entry in `src/dev/intercept.ts` (unhandled hosts throw loudly in dev mode) |
| New Linear SDK query/mutation or raw GraphQL | `src/dev/handlers/linear.ts` (unknown operations throw with the operation name) |
| New environment variable | a fake value in `.env.mock` — it must enumerate every var so real values never leak into mock runs |
| New DB rows derived from Linear issues | use ids from `src/dev/fixtures/linear.ts`, the single source of truth shared by the seed, the Linear mock, and the simulators |

`DEV_MODE`/`NEXT_PUBLIC_DEV_MODE` live exclusively in `.env.mock` — never put
them in `.env` or `.env.local`. Dev mode refuses to start against a non-local
database (`assertDevModeSafety` in `src/lib/dev-mode.ts`).

## Architecture

**Stack**: Next.js 16 App Router, React 19, TypeScript, Prisma 7/PostgreSQL, better-auth, Mantine 9, Tailwind CSS 4, Biome.

DevHub is a developer payment and operations dashboard for MYSverse. It handles:

- PPT payouts for Linear tasks labeled `PPT`, paid from Linear estimate points.
- Non-guaranteed monthly bonus payouts for eligible assigned non-PPT Linear work.
- Payment routing through manual admin processing, Billplz, Xendit, and Roblox/FinSys.
- Developer onboarding, linked accounts, KYC, document signing, access sync, and welcome pack administration.

## Key Patterns

- **Auth**: better-auth is configured in `src/lib/auth.ts` with Prisma adapter tables (`User`, `Session`, `Account`, `Verification`) and generic OAuth providers for Linear, Discord, and Roblox. Client helpers live in `src/lib/auth-client.ts`; server session lookup is `getSession()` in `src/lib/auth-utils.ts`.
- **Middleware**: `src/proxy.ts` protects `/dashboard`, `/settings`, and `/onboarding`, redirecting unauthenticated users to `/sign-in`.
- **Admin access**: use `requireAdmin()`, `requireAdminPage()`, and `hasAdminAccess()` from `src/lib/authz.ts`. Admin access is granted by `role === ADMIN` or developer rank `DEVELOPER_COUNCIL`/`HEAD_DEVELOPER`.
- **Server vs client components**: data-fetching pages/layouts are server components. Interactive UI and form flows use `"use client"`. Server actions are colocated in route-specific `actions.ts` files.
- **Linear OAuth**: `src/lib/linear.ts` uses stored better-auth Linear OAuth tokens and refresh tokens. If auth fails, it throws `LinearReauthRequiredError` so UI can send users to `/auth/reauth-linear`.
- **Prisma client**: `src/lib/prisma.ts` uses the Prisma `pg` adapter with a PostgreSQL pool.
- **Animations and notifications**: use `motion`, `motion-plus`, shared helpers in `src/components/animations.tsx`, and `sonner` for toasts.

## Payment Logic

- PPT completion is handled by `src/app/api/webhooks/linear/route.ts`. A completed Linear issue must have the `PPT` label, an estimate, and an assignee. The transaction amount is `estimate * rate`, using the user's payout currency.
- Currency helpers are in `src/lib/currency.ts`: MYR uses RM20/point and Robux uses 1,200 Robux/point by default.
- Weekly auto-approval limits are in `src/lib/credit-limit.ts` and apply only to PPT transactions.
- Payout provider routing is in `src/lib/payout.ts`. Bonus transactions are manual/admin-approved and are not auto-paid through the weekly PPT credit limit path.
- Payment slips are generated by `src/lib/transaction-slip-pdf.ts`; bonus slips include line items.

## Bonus Logic

- Bonus eligibility and Linear sync live in `src/lib/bonus.ts`.
- All assigned non-PPT Linear issues can become bonus candidates unless excluded by system/config labels, canceled state, missing estimate, missing linked assignee, or existing non-rejected PPT transaction.
- `PPT` is always excluded. Default configurable excluded labels are `Redistributable` and `Redistributed`.
- Active eligible tasks show potential earnings as `Up to X`; completed eligible tasks move to `READY_FOR_REVIEW`.
- Admins review monthly bonus candidates in the Admin Bonuses tab, enter final per-task amounts up to each cap, and approve one grouped `BONUS` transaction per developer/month/currency.
- Dashboard bonus notifications use `/api/bonuses/notifications` plus `src/components/BonusNotificationPoller.tsx`.

## Route Structure

```text
src/app/
├── page.tsx                         # Landing page
├── layout.tsx                       # Root layout with MantineProvider and Toaster
├── sign-in/[[...sign-in]]/          # better-auth OAuth sign-in UI
├── onboarding/                      # Profile, linked accounts, documents, payment setup
├── auth/reauth-linear/              # Linear reconnect flow
├── api/
│   ├── auth/[...all]/route.ts       # better-auth Next handler
│   ├── bonuses/notifications/       # bonus notification polling/read API
│   ├── cron/                        # Billplz/Xendit/KYC cron endpoints
│   ├── webhooks/                    # Linear, Billplz, Xendit webhooks
│   ├── transactions/[id]/pdf/       # payment slip PDF
│   └── kyc/, documents/, welcome-pack/
└── dashboard/
    ├── layout.tsx                   # server layout; loads profile/admin status
    ├── DashboardLayoutClient.tsx    # AppShell/nav/client session menu
    ├── page.tsx                     # overview wallet, tasks, leaderboard, transactions
    ├── ppts/                        # PPT board and PPT requests
    ├── bonuses/                     # developer bonus candidates and history
    ├── settings/                    # profile, linked accounts, payment/KYC settings
    ├── documents/                   # document signing and COI entries
    ├── welcome-pack/                # developer welcome pack flow
    └── admin/                       # payouts, bonuses, access, users, KYC, docs, welcome pack
```

## Database Models

- **User/UserProfile**: better-auth user plus app profile keyed by the same user ID. Stores linked Linear/Discord/Roblox IDs, role/rank/specialties, payment preferences, KYC state through relations, project memberships, and transactions.
- **Transaction/Payout**: payout ledger. `Transaction.source` distinguishes `PPT`, `BONUS`, and `MANUAL`; statuses are `PENDING`, `PAID`, `CANCELLED`, and `REJECTED`.
- **BonusConfig/BonusCandidate/BonusNotification**: bonus scale/config, synced Linear bonus candidates, and unread developer notification events.
- **PptRequest**: developer requests for admins to create or mark Linear issues as PPT.
- **KycVerification/KycAuditLog**: KYC review and audit history.
- **SignedDocument/CoiEntry**: NDA/COI document acceptance and conflict disclosures.
- **WelcomePack/WelcomePackOrder/...**: welcome pack configuration, assets, orders, and item selections.
- **DevProject/ProjectMembership/AccessSync...**: Roblox/Discord/Linear access mapping and sync audit state.

## Environment Variables

Commonly used env vars include:

```text
DATABASE_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL
LINEAR_CLIENT_ID
LINEAR_CLIENT_SECRET
LINEAR_API_KEY                  # optional image-proxy fallback only
LINEAR_WEBHOOK_SECRET
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_BOT_TOKEN
ROBLOX_CLIENT_ID
ROBLOX_CLIENT_SECRET
ROBLOX_GROUP_ID
ROBLOX_OPEN_CLOUD_API_KEY
ROBLOX_OPEN_CLOUD_TOKEN
ROBLOX_LEGACY_COOKIE
FINSYS_API_URL
FINSYS_API_KEY
BILLPLZ_API_SECRET_KEY
BILLPLZ_XSIGNATURE_KEY
BILLPLZ_PAYMENT_ORDER_COLLECTION_ID
BILLPLZ_SANDBOX
XENDIT_API_KEY
XENDIT_CALLBACK_VERIFICATION_TOKEN
RESEND_API_KEY
EMAIL_FROM
NEXT_PUBLIC_APP_URL
KV_REST_API_URL
KV_REST_API_TOKEN
BLOB_READ_WRITE_TOKEN
CRON_SECRET
```

## Linting And Formatting

- Biome is the formatter/linter/import organizer.
- Code style is double quotes and space indentation.
- `pnpm check` and `pnpm lint` are configured with `--write`; use `pnpm exec biome check .` for a non-mutating check.

## UI And Styling

- Mantine 9 is the component library with dark color scheme and blue primary color.
- **Mantine compound components**: do not use dot-notation such as `Table.Tr`, `Menu.Item`, or `AppShell.Header`. Import flat component names directly, for example `TableTr`, `TableTd`, `MenuItem`, `AppShellHeader`.
- **Server component navigation**: do not pass `component={Link}` to Mantine components from Server Components. Use `LinkButton` (`src/components/LinkButton.tsx`) and `LinkAnchor` (`src/components/LinkAnchor.tsx`) for internal navigation wrappers.
- Tailwind CSS 4 is available alongside Mantine. PostCSS uses the Mantine preset and breakpoint variables.
- Path alias: `@/*` maps to `src/*`.
