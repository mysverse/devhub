/**
 * Bearer check shared by every cron route.
 *
 * The load-bearing half is `!cronSecret`. Without it, an environment where
 * CRON_SECRET is unset or misspelled turns every cron route into a public
 * endpoint that anyone can drive — including the ones that move money and the
 * ones that delete PII. It was copy-pasted into twelve routes, which is twelve
 * chances to paste the comparison and forget the guard.
 *
 * Deliberately NOT a `cronRoute(name, handler)` wrapper. That would bundle
 * auth, timing, logging and the response envelope into one thing with four
 * reasons to change, and would hide the response shape behind a closure on
 * exactly the surface where "what does this route return" is why you opened
 * the file. Each route keeps its own `NextResponse.json(...)`.
 */
export function isAuthorizedCronRequest(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}
