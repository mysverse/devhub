import type { Metadata } from "next";
import { siteConfig } from "@/lib/config";
import { getOauthProviderAvailability } from "@/lib/integration-availability";
import { buildSocialMetadata } from "@/lib/social-previews";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  ...buildSocialMetadata("/"),
  title: {
    absolute: `${siteConfig.name} ${siteConfig.appName}`,
  },
};

export default function Home() {
  return (
    <HomeClient linearAvailability={getOauthProviderAvailability("linear")} />
  );
}
