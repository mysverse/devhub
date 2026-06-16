import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { getSession } from "@/lib/auth-utils";
import {
  listInAppNotifications,
  serializeInAppDelivery,
} from "@/lib/notifications";
import { buildSocialMetadata } from "@/lib/social-previews";
import NotificationsPageClient from "./NotificationsPageClient";

export const metadata: Metadata = buildSocialMetadata(
  "/dashboard/notifications",
);

export default function NotificationsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        subtitle="Stay updated with your activities, PPT payouts, and task notifications."
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <NotificationsContent />
      </Suspense>
    </PageContainer>
  );
}

async function NotificationsContent() {
  const { userId } = await getSession();
  if (!userId) redirect("/");

  const deliveries = await listInAppNotifications(userId, 100);

  return (
    <NotificationsPageClient
      initialNotifications={deliveries.map(serializeInAppDelivery)}
    />
  );
}
