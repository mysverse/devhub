# AGENTS.md

This file provides guidance to coding agents when working in this repository.

## Commands

```bash
pnpm dev                    # Start the Next.js dev server (needs real env vars)
pnpm dev:mock               # Start in dev mode: local DB + seeded data + mocked services
pnpm build                  # Production build; runs prisma generate first
pnpm build:mock             # Production build with mock env — use this to verify builds locally
pnpm start                  # Start the production server
pnpm lint                   # Run Biome lint with auto-fix
pnpm check                  # Run Biome check with auto-fix
pnpm typecheck              # prisma generate && tsc --noEmit
pnpm smoke                  # Dev-mode route sweep (requires pnpm dev:mock running)
pnpm visual                 # Playwright layout checks + screenshots (requires pnpm dev:mock running)
pnpm simulate <...>         # Dev-mode webhook/cron simulators (see Dev Mode below)
pnpm linear:validate        # Validate committed raw Linear GraphQL documents
pnpm linear:schema:update   # Refresh the committed Linear schema snapshot (needs Linear token)
pnpm exec prisma validate   # Validate the Prisma schema
pnpm exec prisma generate   # Regenerate Prisma client after schema changes
pnpm exec prisma migrate dev # Create/apply development migrations
```

Bare `pnpm build` needs production-like secrets (KV, Better Auth, Resend,
provider credentials) and dies during page-data collection without them —
use `pnpm build:mock`, which loads `.env.mock` first.

## Production Builds & Prerendering (Cache Components)

Hard-won rules — violating any of these produces failures that are expensive
to diagnose:

- **Run `pnpm build:mock` before pushing** anything that touches server
  components, layouts, route structure, or `next.config.ts`. TypeScript and
  the dev server do not exercise the static prerender pass; only a real
  build does.
- **Never let a non-production `NODE_ENV` reach `next build`.**
  `next.config.ts` fails fast on this. If you see the error: some env file or
  wrapper injected it. The underlying failure mode is the vendored
  react-dom-server resolving its development build against production react,
  which crashes every prerender with
  `Cannot read properties of null (reading 'useContext')`. `.env.mock`
  deliberately has no NODE_ENV entry — do not add one.
- **Suspense subtrees that read uncached data (Prisma, fetch) must read
  request data first or `await connection()`** (from `next/server`).
  Cache Components rejects components that touch the clock or uncached IO
  before any `cookies()`/`headers()`/`connection()` read — and Prisma
  Accelerate samples the clock internally, so this **only fails on Vercel**,
  never against the local pg adapter. Components that go through
  `getSession()`/`requireAdminPage()` are already safe; a component that hits
  Prisma directly (e.g. a badge/count in its own `<Suspense>`) needs
  `await connection()` first. Precedents: 4af3648, `PendingKycBadge` in
  `src/app/dashboard/admin/page.tsx`.
- **Do not trust `next build --debug-prerender` as a green signal** — it
  skips the strict prerender enforcement and passes builds that fail for
  real. Use it only for better stack traces. To unmask "ignore-listed
  frames" in prerender errors, build with `__NEXT_SHOW_IGNORE_LISTED=true`.
- **Deploys migrate after the build succeeds**: `vercel.json` sets
  `buildCommand` to `pnpm build && prisma migrate deploy` so a broken build
  can no longer leave production running old code against a newly migrated
  schema. Keep that ordering; prerenders defer all DB IO, so the build never
  needs the new schema. Deploys run the same `build` script as local runs on
  purpose — put build steps in `package.json`, not in `vercel.json`.
- **Keep `sharp` pinned to the version Next depends on.** sharp's prebuilt
  binding reaches `libvips-cpp.so.*` through an RPATH rather than an import,
  so tracing only bundles the library when it recognises sharp's package
  layout — which it does for the release Next ships (0.34.x, `next`'s own
  optional dependency) but not for 0.35.x, whose binding hides behind an
  `index.cjs` indirection. On 0.35.x every route touching an image 500s in
  production with `ERR_DLOPEN_FAILED: libvips-cpp.so.<version>: cannot open
  shared object file`, while working fine locally where `node_modules` still
  holds the file. Check with `pnpm why sharp` before bumping it; matching
  Next also keeps a single copy in the tree.
- **Do not reach for `outputFileTracingIncludes` to fix a missing native
  library.** A glob naming a file inside pnpm's store gets re-derived through
  every symlink pointing at it, and Vercel then rejects the upload with "The
  framework produced an invalid deployment package for a Serverless
  Function" — after a fully green build. `outputFileTracingExcludes` cannot
  clean it up either; those paths are added after the exclude pass runs.
- `pnpm check-traces` (part of `pnpm build`) fails the build on both of the
  above: a bundle carrying sharp's binding without the matching libvips, and
  any traced file sitting inside a symlinked directory.

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
- `pnpm visual` (script: `scripts/dev/visual.ts`) drives Playwright Chromium
  over every key page at mobile/tablet/laptop/desktop widths, writes
  screenshots to `screenshots/` (gitignored), and fails on layout breakage:
  horizontal page overflow, or header content wrapping/overflowing the fixed
  60px bar (the failure mode when the top nav gains too many links). One-time
  setup: `pnpm exec playwright install chromium`. Run it after touching the
  dashboard shell, nav, or any page-level layout; pass a route prefix to
  scope it (`pnpm visual /dashboard/ppts`).
- Restart `pnpm dev:mock` after editing `src/dev/**` or
  `src/instrumentation.ts` — the fetch interceptor installs once at boot and
  HMR does not reliably reload it.

**Drift contract — when you change the codebase, keep dev mode true:**

| Change | Also update |
|---|---|
| New Prisma model or page that needs data | `prisma/seed.ts` (typed against the real client — `pnpm typecheck` catches drift) and the route list in `scripts/dev/smoke.ts` |
| New outbound HTTP call / external service | handler in `src/dev/handlers/` + ROUTES entry in `src/dev/intercept.ts` (unhandled hosts throw loudly in dev mode) |
| New Linear SDK query/mutation | `src/dev/handlers/linear.ts` (unknown operations throw with the operation name) |
| New raw Linear GraphQL query/mutation | `src/lib/linear-documents.ts`, `LINEAR_GRAPHQL_DOCUMENTS`, and `src/dev/handlers/linear.ts` if mock data changes; run `pnpm linear:validate`. Refresh `scripts/linear/linear.schema.graphql` with `pnpm linear:schema:update` when bumping Linear/API behavior. |
| New environment variable | a fake value in `.env.mock` — it must enumerate every var so real values never leak into mock runs |
| New DB rows derived from Linear issues | use ids from `src/dev/fixtures/linear.ts`, the single source of truth shared by the seed, the Linear mock, and the simulators |
| New cron route | `vercel.json` crons array **and** `CRON_ROUTES` in `scripts/dev/simulate.ts` |
| New notification type | an entry in `src/lib/notifications/catalog.ts` — `catalog.test.ts` fails without one |

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
- **Welcome pack invariants**: `WelcomePackOrder.activeUserId` equals `userId` while an order is live and is NULL once CANCELLED/REJECTED (the nullable unique replaces a `userId` unique so users can re-order after terminal states; DELIVERED keeps the slot). Admin status changes must go through `transitionOrder()` in the admin `actions.ts` — it commits the CAS update and the `WelcomePackOrderEvent` audit row atomically and keeps `activeUserId` in sync. The ordering window (`getOrderingWindowState` in `src/lib/welcome-pack-ordering.ts`) is enforced server-side in `submitWelcomePackOrder` and deliberately NOT in `updateMyWelcomePackOrder` (amendments aren't new orders). Field/selection validation shared by client and server lives in `src/lib/welcome-pack-validation.ts`.

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

## Payout Campaigns

Limited-time multipliers ("3x PPT this sprint") spanning all three earning
paths. Pure logic in `src/lib/payout-campaign.ts` (client-safe, unit-tested),
IO in `payout-campaign-server.ts`, admin console at
`/dashboard/admin/campaigns`. These invariants are load-bearing — breaking one
misprices real payouts:

- **Campaigns never stack.** `selectCampaign()` takes the highest multiplier,
  ties broken by most recently created. Never sum or compose multipliers.
- **The campaign is locked in at first payout eligibility**, onto
  `PptPayoutState.campaignId`/`campaignMultiplier`. PPT amounts are rewritten
  after creation (estimate change, ON_HOLD release, any later webhook);
  those paths must call `applyLockedCampaign()` and never re-resolve against
  the clock, or an expiring campaign silently reprices a live payout to 1x.
- **The weekly credit limit is measured in base amounts.**
  `isWithinCreditLimit()` takes the pre-multiplier amount and
  `getUserWeeklyUsage()` aggregates `Transaction.baseAmount`. The limits are
  one level-5 task per week, so counting multiplied amounts would drop every
  promo payout out of auto-approval. The campaign uplift pool is what caps
  promo spend.
- **Every multiplied amount goes through `roundAmount()`**; a 1.5x campaign
  would otherwise send fractional Robux to FinSys and sub-cent MYR to Billplz.
- **`PayoutCampaignApplication` is both the uplift ledger and the idempotency
  key** — unique on `(campaignId, scope, entityId)`. Rejections and
  cancellations set `reverted`, they never delete.
- **Guardrails fall back to 1x, they never block a payout.** An exhausted pool
  or per-user cap logs and pays the normal rate.
- **Cache only the campaign rows, never the resolved window.** `getCampaignRows`
  is `"use cache"`; `getCampaignWindowState()` is evaluated by the caller
  against live server time, or a campaign starts and ends late.
- **Incentive awards resolve the campaign at the END of the award period**
  (clamped to now), so an award belongs to its week rather than to whenever the
  cron ran. Align incentive campaign windows to Monday 00:00 UTC; the admin
  form warns when they are not.
- `scripts/dev/repair-ppt-payouts.ts` is campaign-aware — comparing against the
  bare 1x rate would flag every promo payout as wrong and, with `--apply`, claw
  back the uplift.
- The promo banner renders inside `AppShellMain`, never the header: `pnpm
  visual` fails when anything wraps out of the fixed 60px bar.

## Activation (getting developers to a first task)

The board is opt-in by design, and the diagnosed failure is people who
onboard and never claim anything. These invariants exist because each one was
already broken once:

- **Proof has one rule, in `src/lib/ppt-proof.ts`.** The Proof button, the
  server action, and the payout evaluator all call `checkProofBody()`. They
  previously disagreed (20 characters vs 40 plus evidence), so proof could
  post to Linear successfully and then silently never release payout. Never
  re-inline a length or a keyword check at a call site.
- **A rejected proof is `PROOF_NOT_QUALIFYING`, not `MISSING_PROOF`.** The
  latter means no proof comment exists. Using it for a rejected one tells a
  developer to post proof they already posted.
- **Notification preferences are derived from the catalog**, via
  `configurablePreferenceKeys()`. Never hand-write the allowlist: it drifted
  to five keys against twelve configurable entries, so fourteen toggles
  rendered, moved, and silently failed to save. A channel is settable only
  where the catalog declares it, and it must appear in the emit site's
  `channels` array or the toggle is decorative.
- **The re-engagement digest must not gate on prior activity.**
  `classifyDigestCohort()` splits by how far someone got (unlinked /
  never-activated / lapsed / idle). The old audience required an existing
  watch or transaction, which excluded the target population by construction.
  The only hard exclusion is someone already carrying a task.
- **Recommendations always carry a `because`.** `rankTasksForDeveloper()` is
  pure and unit-tested; it matches titles as well as labels because the Linear
  workspace carries no specialty labels, and it matches whole words only
  ("rapid transit" contains "api"). A ranked list with no stated reason reads
  as a lottery.
- **One task suggestion per person, ever** — enforced by the unique index on
  `TaskSuggestion(linearIssueId, userId)`, not by a check that can be raced.
  Claiming resolves outcomes (`CLAIMED` / `TAKEN`), which is the only read on
  whether pushing work at people works.

## LLM Adapter

`src/lib/llm.ts` (transport), `llm-prompts.ts` (prompts + schemas),
`llm-suggestions.ts` (the surfaces). Model and request shape live in exactly
one place.

- **The adapter is always optional.** `getLlmClient()` returns null without
  `ANTHROPIC_API_KEY`, and `generateStructured()` returns null for every
  failure — no key, rate limit, refusal, malformed output, network. Callers
  cannot distinguish them, deliberately: there is one fallback, do it
  manually. Nothing in the payout chain, and nothing a developer needs in
  order to get paid, may depend on a model being reachable. Production runs
  with the key unset until drafts have been reviewed.
- **No PII goes to the model.** Prompt builders take `PromptIssue` and
  `PromptDeveloper`, which carry issue text and specialty enums and nothing
  else — there is no field for a legal name, email, address, or bank detail,
  and developers are referred to by opaque ref. Widening those types is how
  this breaks; `llm-prompts.test.ts` asserts their shape.
- **Output is schema-validated** with `zodOutputFormat` + `messages.parse`, so
  a caller gets a typed object or null, never prose to regex.
- **The request shape is not uniform across models.** `MODELS` in `llm.ts` is
  the allow-list: Sonnet 5 and Opus 5 take adaptive thinking plus an `effort`
  level, Haiku 4.5 predates both and needs `budget_tokens` while rejecting
  `effort`. Add a model there or it can't be selected; getting the pairing
  wrong is a 400, not a worse answer. Effort defaults to `low` — this is
  advisory output a human reviews, so cost beats depth unless a caller says
  otherwise.
- **Everything it produces is advisory.** Drafts prefill a form a human
  submits; triage produces a review queue. The adapter never writes to Linear,
  creates a transaction, or announces anything.
- **Dev mode intercepts `api.anthropic.com`** (`src/dev/handlers/anthropic.ts`)
  and returns a canned reply shaped to the requested schema. `pnpm dev:mock`
  must never make a real model call.

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
│   ├── cron/                        # Billplz/Xendit/KYC/incentive/campaign crons
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
    └── admin/                       # payouts, bonuses, campaigns, access, users, KYC, docs, welcome pack
```

## Database Models

- **User/UserProfile**: better-auth user plus app profile keyed by the same user ID. Stores linked Linear/Discord/Roblox IDs, role/rank/specialties, payment preferences, KYC state through relations, project memberships, and transactions.
- **Transaction/Payout**: payout ledger. `Transaction.source` distinguishes `PPT`, `BONUS`, and `MANUAL`; statuses are `PENDING`, `PAID`, `CANCELLED`, and `REJECTED`.
- **BonusConfig/BonusCandidate/BonusNotification**: bonus scale/config, synced Linear bonus candidates, and unread developer notification events.
- **PptRequest**: developer requests for admins to create or mark Linear issues as PPT.
- **TaskSuggestion**: an admin pointing one developer at one open task, with the reason and the outcome (`CLAIMED`/`TAKEN`). Unique per `(linearIssueId, userId)`.
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
ANTHROPIC_API_KEY               # optional; every LLM surface degrades without it
ANTHROPIC_MODEL                 # optional; default claude-sonnet-5
LLM_MAX_CALLS_PER_HOUR          # optional; rolling-hour cap, 0 disables
LLM_MAX_CALLS_PER_USER_PER_HOUR # optional; per-user cap, 0 disables
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
