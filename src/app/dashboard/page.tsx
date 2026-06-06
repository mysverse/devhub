import { Alert, Stack } from "@mantine/core";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth-utils";
import { getCurrencyForPaymentMethod } from "@/lib/currency";
import prisma from "@/lib/prisma";
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

export default async function DashboardPage() {
  const { userId, user } = await getSession();
  if (!userId) redirect("/");

  let userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    include: { transactions: true },
  });

  if (!userProfile) {
    userProfile = await prisma.userProfile.create({
      data: {
        id: userId,
        legalName: user?.name ?? null,
      },
      include: { transactions: true },
    });
  }

  if (!userProfile.linearId) {
    const linearAccount = await prisma.account.findFirst({
      where: { userId, providerId: "linear" },
      select: { accountId: true },
    });

    if (linearAccount) {
      userProfile = await prisma.userProfile.update({
        where: { id: userId },
        data: {
          linearId: linearAccount.accountId,
          linearEmail: user?.email ?? null,
        },
        include: { transactions: true },
      });
    }
  }

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

        <RecentTransactions transactions={userProfile.transactions} />
      </Stack>
    </>
  );
}
