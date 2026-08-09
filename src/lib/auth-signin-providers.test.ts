/**
 * Linear is DevHub's sole authenticator. Discord and Roblox are attribute
 * links only, and must never be usable to authenticate.
 *
 * This is the test that would have caught the regression where giving the
 * Discord/Roblox mappers an `email` (needed to satisfy better-auth's
 * `email_is_missing` check on the link flow) silently turned both into
 * working primary sign-in providers: POST /sign-in/oauth2 is public and
 * unauthenticated, and better-auth resolves an existing account by
 * (providerId, accountId) before it ever consults email — so a stolen
 * Discord account would have minted a full DevHub session as that user.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

// The guard rejects before any adapter call, so a deliberately unreachable
// database is enough — and doubles as proof that it short-circuits early.
process.env.DATABASE_URL ??= "postgresql://u:p@127.0.0.1:1/unreachable";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "https://devhub.test";
process.env.DISCORD_CLIENT_ID ??= "test";
process.env.DISCORD_CLIENT_SECRET ??= "test";
process.env.ROBLOX_CLIENT_ID ??= "test";
process.env.ROBLOX_CLIENT_SECRET ??= "test";
process.env.LINEAR_CLIENT_ID ??= "test";
process.env.LINEAR_CLIENT_SECRET ??= "test";

async function signInWith(providerId: string) {
  const { auth } = await import("./auth");
  try {
    await auth.api.signInWithOAuth2({
      body: { providerId, callbackURL: "/dashboard" },
    });
    return { blocked: false, message: "" };
  } catch (error) {
    const status = (error as { status?: string }).status;
    const message =
      (error as { body?: { message?: string } }).body?.message ??
      (error as Error).message;
    // Only a deliberate BAD_REQUEST counts as "blocked" — an incidental
    // failure (e.g. the unreachable database) must not pass for a guard.
    return { blocked: status === "BAD_REQUEST", message };
  }
}

for (const providerId of ["discord", "roblox"]) {
  test(`${providerId} cannot be used to sign in`, async () => {
    const { blocked, message } = await signInWith(providerId);
    assert.equal(
      blocked,
      true,
      `${providerId} sign-in was not rejected (got: ${message})`,
    );
    assert.match(message, /cannot be used to sign in/);
  });
}

test("linear sign-in is not blocked by the provider guard", async () => {
  const { blocked } = await signInWith("linear");
  // Linear gets past the guard; it only fails later reaching the fake
  // database. If this ever reports blocked, the guard is too broad and has
  // locked every user out of the only way into DevHub.
  assert.equal(blocked, false, "linear sign-in must not be rejected");
});

async function linkWith(providerId: string) {
  const { auth } = await import("./auth");
  try {
    await auth.api.oAuth2LinkAccount({
      body: { providerId, callbackURL: "/dashboard/settings" },
      headers: new Headers(),
    });
    return { blocked: false, message: "" };
  } catch (error) {
    const status = (error as { status?: string }).status;
    const message =
      (error as { body?: { message?: string } }).body?.message ??
      (error as Error).message;
    return { blocked: status === "BAD_REQUEST", message };
  }
}

test("linear cannot be linked separately from signing in", async () => {
  // Otherwise a signed-in user could attach a second Linear identity and
  // silently repoint UserProfile.linearId at it.
  const { blocked, message } = await linkWith("linear");
  assert.equal(blocked, true, `linear link was not rejected (got: ${message})`);
  assert.match(message, /cannot be linked separately/);
});

for (const providerId of ["discord", "roblox"]) {
  test(`${providerId} is not blocked on the link route`, async () => {
    // These must stay linkable — that is the whole point of the flow. Without
    // a session the call still fails, but on UNAUTHORIZED, never BAD_REQUEST.
    const { blocked } = await linkWith(providerId);
    assert.equal(blocked, false, `${providerId} linking must not be rejected`);
  });
}
