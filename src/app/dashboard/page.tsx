import { Alert, Stack } from "@mantine/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cache, Suspense } from "react";
import { getSession } from "@/lib/auth-utils";
import { getCurrencyForPaymentMethod } from "@/lib/currency";
import { buildSocialMetadata } from "@/lib/social-previews";
import { ensureUserProfile } from "@/lib/user-profile";
import ActiveTasks from "./_components/ActiveTasks";
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

async function LinearLinkAlert() {
  const { user, userProfile } = await getDashboardContext();

  if (userProfile.linearId) return null;

  return (
    <Alert color="yellow" title="Linear Account Not Linked" mb={32}>
      We couldn&apos;t automatically link your Linear account. Please ensure
      your account email ({user?.email || "Not set"}) matches your Linear
      workspace email, or try signing out and back in.
    </Alert>
  );
}

async function HeroSection() {
  const { userId, user, userProfile, userCurrency } =
    await getDashboardContext();

  return (
    <Hero
      userProfile={userProfile}
      userId={userId}
      currency={userCurrency}
      user={{ name: user?.name, email: user?.email }}
    />
  );
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
    <>
      <Suspense fallback={null}>
        <LinearLinkAlert />
      </Suspense>

      <Stack gap={48}>
        <Suspense fallback={<HeroSkeleton />}>
          <HeroSection />
        </Suspense>

        <Suspense fallback={<ActiveTasksSkeleton />}>
          <ActiveTasksSection />
        </Suspense>

        <Suspense fallback={<IncentiveProgressSkeleton />}>
          <IncentiveProgressSection />
        </Suspense>

        <Suspense fallback={<CarouselSkeleton />}>
          <SuggestedPptsSection />
        </Suspense>

        <Suspense fallback={<LeaderboardSkeleton />}>
          <LeaderboardSection />
        </Suspense>

        <Suspense fallback={null}>
          <RecentTransactionsSection />
        </Suspense>
      </Stack>
    </>
  );
}
