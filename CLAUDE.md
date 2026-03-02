# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build (runs prisma generate first)
pnpm lint         # Run Biome linter with auto-fix
pnpm check        # Run Biome check (lint + format + import organization) with auto-fix
pnpm prisma migrate dev    # Run database migrations
pnpm prisma generate       # Regenerate Prisma client after schema changes
```

## Architecture

**Stack**: Next.js 16 (App Router) + TypeScript + Prisma (PostgreSQL) + Clerk auth + Mantine UI + Tailwind CSS

This is a pay-per-task (PPT) tracking dashboard for developers. It integrates with Linear for task management — when a Linear issue is completed, a webhook credits the developer based on `estimate * 5`.

### Key Patterns

- **Server vs Client components**: Pages that fetch data are server components. Interactive forms/UI use `'use client'`. Layouts fetch auth/profile data server-side and pass to client layout components.
- **Server Actions**: Located in `actions.ts` files colocated with their route (e.g., `src/app/dashboard/settings/actions.ts`). All actions authenticate via `auth()` from Clerk and check roles where needed.
- **Auth middleware**: `src/proxy.ts` (not `middleware.ts`) — Clerk middleware protecting `/dashboard` and `/settings` routes.
- **Linear OAuth**: `src/lib/linear.ts` retrieves user OAuth tokens via Clerk, falling back to a system `LINEAR_API_KEY`.
- **Prisma client**: `src/lib/prisma.ts` uses the `pg` adapter with a connection pool.
- **Animations**: Uses `motion` (not `framer-motion`) and `motion-plus`. Animation components are in `src/components/animations.tsx`.

### Route Structure

```
src/app/
├── page.tsx                          # Landing page
├── layout.tsx                        # Root layout (ClerkProvider + MantineProvider, dark theme)
├── sign-in/[[...sign-in]]/           # Clerk sign-in
├── sign-up/[[...sign-up]]/           # Clerk sign-up
├── api/webhooks/linear/route.ts      # Linear webhook (issue completion → transaction creation)
└── dashboard/
    ├── layout.tsx                    # Server layout (fetches user profile/admin status)
    ├── DashboardLayoutClient.tsx     # Client layout (AppShell, navbar)
    ├── page.tsx                      # Overview (wallet, active tasks, transactions)
    ├── ppts/page.tsx                 # PPT board (all tasks from Linear)
    ├── settings/                     # Profile & payment preferences
    └── admin/                        # Admin-only: pending payouts
```

### Database Models (Prisma)

- **UserProfile**: Keyed by Clerk user ID. Has linked Linear/Discord/Roblox accounts, role (ADMIN/DEVELOPER), and payment method preferences (PayPal, DuitNow, Robux, bank transfer).
- **Transaction**: PPT payments tied to Linear issues. Status: PENDING → PAID or CANCELLED. `linearIssueId` is unique to prevent double crediting.
- **Invite**: Token-based invite system managed by admins.

### Environment Variables

```
DATABASE_URL             # PostgreSQL connection string
CLERK_SECRET_KEY         # Clerk server-side secret
LINEAR_API_KEY           # Fallback Linear API key
LINEAR_WEBHOOK_SECRET    # HMAC-SHA256 webhook verification
```

### Linting & Formatting

- **Biome** (not ESLint) for linting and formatting
- Double quotes for JS/TS strings
- Space indentation
- Auto-organized imports via Biome assist

### UI & Styling

- **Mantine v8** as the component library with dark color scheme and blue primary color
- **Tailwind CSS v4** for utility classes alongside Mantine
- **PostCSS** configured with Mantine preset and breakpoint variables
- Path alias: `@/*` maps to `src/*`
