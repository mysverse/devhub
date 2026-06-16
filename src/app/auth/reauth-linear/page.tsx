import type { Metadata } from "next";
import { getOauthProviderAvailability } from "@/lib/integration-availability";
import { buildSocialMetadata } from "@/lib/social-previews";
import ReauthLinearClient from "./ReauthLinearClient";

export const metadata: Metadata = buildSocialMetadata("/auth/reauth-linear");

export default function ReauthLinearPage() {
  return (
    <ReauthLinearClient
      linearAvailability={getOauthProviderAvailability("linear")}
    />
  );
}
