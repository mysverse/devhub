import type { Metadata } from "next";
import { Suspense } from "react";
import { buildSocialMetadata } from "@/lib/social-previews";
import SignInClient from "./SignInClient";

export const metadata: Metadata = buildSocialMetadata("/sign-in");

type Params = Promise<Record<string, string[] | undefined>>;

export default function SignInPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <SignInContent params={params} />
    </Suspense>
  );
}

async function SignInContent({ params }: { params: Params }) {
  await params;
  return <SignInClient />;
}
