---
title: "How Earning Works"
version: "1.0"
type: "GUIDE"
---

## The lifecycle at a glance

Every paid task moves through the same pipeline — most of it automatic:

```mermaid
flowchart LR
    A[Claim a PPT] --> B[Work & post progress]
    B --> C[Move to Done in Linear]
    C --> D[Post #ppt-proof comment]
    D --> E[Stability window: {{stabilityMinutes}} min in Done]
    E --> F{Within weekly credit?}
    F -->|Yes| G[Paid automatically]
    F -->|No| H[Admin releases manually]
    H --> G
```

## Claiming tasks

The [PPT Board](/dashboard/ppts) lists every open Pay-Per-Task. Claiming reserves a task for you instantly — no approval needed. The deal you accept when you claim:

- **Stay visibly active.** After **{{warnHours}} hours** without activity you get a reminder; after **{{unassignHours}} hours** the task returns to the board so it never gets stuck. Any progress note, state change, or description edit resets the timer.
- **Waiting on someone?** Mark the task **blocked** from your task card — it pauses the timer for up to **{{selfBlockHours}} hours** without filler comments. Repeated blocks are shown to admins so they can help unblock you.
- **Changed your mind?** **Release** the task any time. It goes straight back to the board and nothing is held against you — releasing beats sitting on a task.
- A task returned to the board is open to everyone, including you. Reclaim it whenever you're ready.

Don't see a task for work you're doing? Use **Request PPT** on the board — an admin reviews it and either creates the task or marks yours as a PPT.

## Getting paid

A completed PPT pays out its complexity estimate at your per-point rate:

| Points | MYR | Robux |
| --- | --- | --- |
| 1 | {{rate1Myr}} | {{rate1Robux}} |
| 2 | {{rate2Myr}} | {{rate2Robux}} |
| 3 | {{rate3Myr}} | {{rate3Robux}} |
| 4 | {{rate4Myr}} | {{rate4Robux}} |
| 5 | {{rate5Myr}} | {{rate5Robux}} |

Your currency follows your payment method (Robux pays in Robux; every other method pays MYR). You can change it in HR Settings.

Payout requires **all** of these:

1. The issue has the **PPT** label and a complexity estimate (1–5 points).
2. The issue is assigned to you and your Linear account is linked to DevHub.
3. The issue is moved to **Done**.
4. You post a **#ppt-proof** comment: what changed, proof links or screenshots, where it's implemented, and how it was verified. The Proof button on your task card formats this for you.
5. The issue stays in Done through the **{{stabilityMinutes}}-minute stability window** (automatic — protects against accidental completions).

Two things reset proof: moving the task out of Done, and an admin asking a follow-up question on the issue. In both cases post fresh proof once resolved.

## The weekly credit limit

Payouts up to **{{weeklyLimitMyr}} / {{weeklyLimitRobux}} per week** are approved and sent automatically. Payouts past the limit are **not lost** — they wait for an admin to release them manually, and the limit resets every Monday at 00:00 UTC. Your dashboard shows a live usage ring.

## Where your money shows up

Every payment lives on the [Transactions page](/dashboard/transactions) with a plain-language explanation of its current state — queued, provider processing, awaiting admin review, on hold (with the reason), rejected (with the reason), or paid — plus a downloadable payment slip.

## Bonuses vs incentives

- **Bonuses** — non-guaranteed monthly payouts for eligible **non-PPT** Linear work. Each candidate shows "Up to X"; admins decide the final amount at a monthly review. See the [Bonuses page](/dashboard/bonuses) for what qualifies and why tasks are excluded.
- **Incentives** — automatic weekly rewards for qualifying completed tasks: throughput thresholds, streaks, and milestones. They appear on your dashboard overview and are paid after a short admin review window.

## FAQ

**Why is my payout "Pending"?** Check the Transactions page — the row tells you exactly which stage it's in and who it's waiting on (you, an admin, or nobody — automatic).

**Why did my task go back to the board?** It hit {{unassignHours}} hours without visible activity — the standard rule for every task, nothing personal. Reclaim it any time.

**Why doesn't my task show as a bonus candidate?** The Bonuses page lists ineligible tasks with the exact reason (missing estimate, excluded label, already paid via PPT, and so on).

**Whom do I ask when something looks wrong?** Any admin — and attach the payment slip or the task link so they can trace it quickly.
