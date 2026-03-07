import { headers } from "next/headers";
import { auth } from "./auth";

export async function getSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return {
    userId: session?.user?.id ?? null,
    session,
    user: session?.user ?? null,
  };
}
