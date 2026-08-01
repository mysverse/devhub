import { Alert, Stack } from "@mantine/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cache, Suspense } from "react";
import { getSession } from "@/lib/auth-utils";
import { getCurrencyForPaymentMethod } from "@/lib/currency";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import { ensureUserProfile } from "@/lib/user-profile";
import AchievementsCard from "./_components/AchievementsCard";
import ActiveTasks from "./_components/ActiveTasks";
import GettingStartedChecklist, {
  type GettingStartedStep,
} from "./_components/GettingStartedChecklist";
import Hero from "./_components/Hero";
import IncentiveProgress from "./_components/IncentiveProgress";
import Leaderboard from "./_components/Leaderboard";
import RecentTransactions from "./_components/RecentTransactions";
import {
  ActiveTasksSkeleton,
  CarouselSkeleton,
  HeroSkeleton,
  IncentiveProgressSkeleton,
  LeaderboardSkeleton,
  TransactionsSkeleton,
} from "./_components/Skeletons";
import SuggestedPPTs from "./_components/SuggestedPPTs";

export const metadata: Metadata = buildSocialMetadata("/dashboard");

const getDashboardContext = cache(async () => {
  const { userId, user } = await getSession();
  if (!userId) redirect("/");

  const userProfile = await ensureUserProfile({
    userId,
    name: user?.name,
    email: user?.email,
  });
  const userCurrency = getCurrencyForPaymentMethod(userProfile.paymentMethod);

  return { userId, user, userProfile, userCurrency };
});

async function HeroSection() {
  const { userId, user, userProfile, userCurrency } =
    await getDashboardContext();

  return (
    <Stack gap="lg">
      {!userProfile.linearId && (
        <Alert color="yellow" title="Linear Account Not Linked">
          We couldn&apos;t automatically link your Linear account. Please ensure
          your account email ({user?.email || "Not set"}) matches your Linear
          workspace email, or try signing out and back in.
        </Alert>
      )}
      <Hero
        userProfile={userProfile}
        userId={userId}
        currency={userCurrency}
        user={{ name: user?.name, email: user?.email }}
      />
    </Stack>
  );
}

async function GettingStartedSection() {
  const { userId, userProfile } = await getDashboardContext();

  if (userProfile.gettingStartedDismissedAt) return null;

  const [hasClaim, proofState, paidPpt, hasPreference] = await Promise.all([
    prisma.pptAssignmentWatch.findFirst({
      where: { userId },
      select: { id: true },
    }),
    prisma.pptPayoutState.findFirst({
      where: {
        userId,
        OR: [
          { proofProvidedAt: { not: null } },
          {
            status: { in: ["READY_FOR_PAYOUT", "TRANSACTION_PENDING", "PAID"] },
          },
        ],
      },
      select: { id: true },
    }),
    prisma.transaction.findFirst({
      where: { userId, source: "PPT", status: "PAID" },
      select: { id: true },
    }),
    prisma.notificationPreference.findFirst({
      where: { userId },
      select: { id: true },
    }),
  ]);

  // Veterans don't need the tour: any paid PPT hides it for good.
  if (paidPpt) return null;

  const steps: GettingStartedStep[] = [
    {
      key: "accounts",
      title: "Link your accounts",
      description:
        "Linear powers tasks and payouts — make sure it's connected, plus your payout method.",
      done: Boolean(userProfile.linearId),
      href: "/dashboard/settings",
      cta: "Open settings",
    },
    {
      key: "claim",
      title: "Claim your first PPT",
      description:
        "Pick a task from the board — claiming reserves it for you instantly.",
      done: Boolean(hasClaim),
      href: "/dashboard/ppts",
      cta: "Browse the board",
    },
    {
      key: "proof",
      title: "Finish a task and post proof",
      description:
        "Move it to Done in Linear, then post a #ppt-proof comment — the Proof button formats it for you.",
      done: Boolean(proofState),
      href: "/dashboard/help",
      cta: "See how proof works",
    },
    {
      key: "payout",
      title: "Get your first payout",
      description:
        "After a short stability window your payment is created automatically.",
      done: false,
      href: "/dashboard/transactions",
      cta: "View transactions",
    },
    {
      key: "notifications",
      title: "Tune your notifications",
      description:
        "Choose what DevHub tells you about — nudges, broadcasts, and digests are all adjustable.",
      done: Boolean(hasPreference),
      href: "/dashboard/settings",
      cta: "Set preferences",
    },
  ];

  if (steps.every((step) => step.done)) return null;

  return <GettingStartedChecklist steps={steps} />;
}

async function ActiveTasksSection() {
  const { userId, userProfile, userCurrency } = await getDashboardContext();

  if (!userProfile.linearId) return null;

  return (
    <ActiveTasks
      linearId={userProfile.linearId}
      userId={userId}
      currency={userCurrency}
    />
  );
}

async function IncentiveProgressSection() {
  const { userId } = await getDashboardContext();
  return <IncentiveProgress userId={userId} />;
}

async function AchievementsSection() {
  const { userId } = await getDashboardContext();
  return <AchievementsCard userId={userId} />;
}

async function SuggestedPptsSection() {
  const { userId, userCurrency } = await getDashboardContext();
  return <SuggestedPPTs userId={userId} currency={userCurrency} />;
}

async function LeaderboardSection() {
  const { userId, userProfile, userCurrency } = await getDashboardContext();

  return (
    <Leaderboard
      userId={userId}
      currentLinearId={userProfile.linearId}
      currency={userCurrency}
    />
  );
}

async function RecentTransactionsSection() {
  const { userId } = await getDashboardContext();
  return <RecentTransactions userId={userId} />;
}

export default function DashboardPage() {
  return (
    <Stack gap={48}>
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSection />
      </Suspense>

      <Suspense>
        <GettingStartedSection />
      </Suspense>

      <Suspense fallback={<ActiveTasksSkeleton />}>
        <ActiveTasksSection />
      </Suspense>

      <Suspense fallback={<IncentiveProgressSkeleton />}>
        <IncentiveProgressSection />
      </Suspense>

      <Suspense>
        <AchievementsSection />
      </Suspense>

      <Suspense fallback={<CarouselSkeleton />}>
        <SuggestedPptsSection />
      </Suspense>

      <Suspense fallback={<LeaderboardSkeleton />}>
        <LeaderboardSection />
      </Suspense>

      <Suspense fallback={<TransactionsSkeleton />}>
        <RecentTransactionsSection />
      </Suspense>
    </Stack>
  );
}
