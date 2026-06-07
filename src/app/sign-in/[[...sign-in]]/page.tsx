import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/social-previews";
import SignInClient from "./SignInClient";

export const metadata: Metadata = buildSocialMetadata("/sign-in");

export default function SignInPage() {
  return <SignInClient />;
}
