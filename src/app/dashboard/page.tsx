import { Alert, Stack } from "@mantine/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
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

export default async function DashboardPage() {
  const { userId, user } = await getSession();
  if (!userId) redirect("/");

  const userProfile = await ensureUserProfile({
    userId,
    name: user?.name,
    email: user?.email,
  });
  const userCurrency = getCurrencyForPaymentMethod(userProfile.paymentMethod);

  return (
    <>
      {!userProfile.linearId && (
        <Alert color="yellow" title="Linear Account Not Linked" mb={32}>
          We couldn&apos;t automatically link your Linear account. Please ensure
          your account email ({user?.email || "Not set"}) matches your Linear
          workspace email, or try signing out and back in.
        </Alert>
      )}

      <Stack gap={48}>
        <Suspense fallback={<HeroSkeleton />}>
          <Hero
            userProfile={userProfile}
            userId={userId}
            currency={userCurrency}
            user={{ name: user?.name, email: user?.email }}
          />
        </Suspense>

        {userProfile.linearId && (
          <Suspense fallback={<ActiveTasksSkeleton />}>
            <ActiveTasks
              linearId={userProfile.linearId}
              userId={userId}
              currency={userCurrency}
            />
          </Suspense>
        )}

        <Suspense fallback={<IncentiveProgressSkeleton />}>
          <IncentiveProgress userId={userId} />
        </Suspense>

        <Suspense fallback={<CarouselSkeleton />}>
          <SuggestedPPTs userId={userId} currency={userCurrency} />
        </Suspense>

        <Suspense fallback={<LeaderboardSkeleton />}>
          <Leaderboard
            userId={userId}
            currentLinearId={userProfile.linearId}
            currency={userCurrency}
          />
        </Suspense>

        <Suspense fallback={null}>
          <RecentTransactions userId={userId} />
        </Suspense>
      </Stack>
    </>
  );
}
