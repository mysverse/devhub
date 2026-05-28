import { isDevMode } from "./dev-mode";

export async function getSession() {
  if (isDevMode()) {
    const { MOCK_USER, MOCK_SESSION, MOCK_USER_ID } = await import(
      "./dev/mock-data"
    );
    return {
      userId: MOCK_USER_ID,
      session: MOCK_SESSION,
      user: MOCK_USER,
    };
  }

  const { headers } = await import("next/headers");
  const { auth } = await import("./auth");
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return {
    userId: session?.user?.id ?? null,
    session,
    user: session?.user ?? null,
  };
}
