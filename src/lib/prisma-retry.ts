import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Transient database failure classification and retry.
 *
 * Prisma Accelerate runs on Cloudflare Workers, and a worker that exceeds its
 * CPU/memory budget is terminated mid-request — the client sees a `P6000` with
 * an HTTP 503 body (`error 1102`, `worker_exceeded_resources`). The same query
 * against the next isolate normally succeeds, so a single shot per call turns
 * an edge hiccup into a failed payout board or a payment confirmation that is
 * never sent.
 *
 * Deliberately Prisma-free so it unit-tests without a DATABASE_URL, and
 * duck-typed on `code`/`meta` rather than `instanceof` — the same style as
 * `isUniqueConstraintError` in `src/lib/notifications/index.ts` and
 * `src/lib/email.ts`. The extension that consumes this lives in
 * `src/lib/prisma.ts`.
 */

/**
 * Worth a second attempt. Accelerate codes plus the engine's connection-level
 * codes, plus the undici codes seen when the edge is unreachable entirely.
 */
const RETRYABLE_ERROR_CODES = new Set([
  // Accelerate
  "P6000", // generic server error — this is what error 1102 arrives as
  "P6004", // query timeout
  "P6008", // connection / engine start error
  // Query engine connectivity
  "P1001", // can't reach database server
  "P1002", // database server reached but timed out
  "P1008", // operations timed out
  "P1017", // server has closed the connection
  // Node / undici transport
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/**
 * Deterministic failures. Retrying these only spends the caller's latency
 * budget to arrive at the same answer — a response that is too large stays too
 * large, and a disabled project stays disabled.
 */
const TERMINAL_ERROR_CODES = new Set([
  "P6001", // invalid data source
  "P6002", // unauthorized
  "P6003", // plan limit reached
  "P6005", // invalid parameters
  "P6006", // version not supported
  "P6009", // response size limit exceeded
  "P6010", // project disabled
]);

/**
 * Operations safe to run twice. Writes are excluded on purpose: a worker that
 * died mid-request may have already committed, so a retried `create` would
 * double-insert — and on this codebase that means a duplicate money row. A
 * call site with a structurally idempotent write (a CAS `updateMany`, a
 * unique-keyed `upsert`) opts in explicitly by wrapping it in
 * `withTransientRetry()`.
 */
export const RETRYABLE_READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readCode(error: Record<string, unknown>): string | null {
  return typeof error.code === "string" ? error.code : null;
}

/** 5xx is the edge failing; 429 is it asking us to come back later. */
function isTransientStatus(status: unknown): boolean {
  return typeof status === "number" && (status >= 500 || status === 429);
}

export function isTransientDatabaseError(error: unknown): boolean {
  const record = asRecord(error);
  if (!record) return false;

  const code = readCode(record);
  if (code) {
    if (TERMINAL_ERROR_CODES.has(code)) return false;
    if (RETRYABLE_ERROR_CODES.has(code)) return true;
    // P2xxx are application-level (unique violations, missing rows). Their
    // call sites already handle them; a retry would just repeat the failure.
    if (code.startsWith("P2")) return false;
  }

  // The Cloudflare body is mirrored onto `meta`. Note that it carries
  // `retryable: false` and "**Do not retry.**" — that is boilerplate addressed
  // to the owner of the Worker (i.e. Prisma), not to us. Honouring it would
  // mean treating every capacity blip as permanent. We retry a small number of
  // times instead, and cap the blast radius by never retrying writes.
  const meta = asRecord(record.meta);
  if (meta && isTransientStatus(meta.status)) return true;
  if (isTransientStatus(record.status)) return true;

  // `fetch failed` from undici wraps the real reason.
  const cause = asRecord(record.cause);
  if (cause) {
    const causeCode = readCode(cause);
    if (causeCode && RETRYABLE_ERROR_CODES.has(causeCode)) return true;
  }

  return record.name === "PrismaClientInitializationError";
}

/** Short identifier for logs: `P6000`, `503`, or the error's class name. */
export function transientErrorCode(error: unknown): string {
  const record = asRecord(error);
  if (!record) return "unknown";

  const code = readCode(record);
  if (code) return code;

  const meta = asRecord(record.meta);
  if (meta && typeof meta.status === "number") return String(meta.status);
  if (typeof record.name === "string") return record.name;
  return "unknown";
}

/**
 * Marks the dynamic extent of an interactive `prisma.$transaction` callback.
 *
 * Prisma's query extensions fire for operations inside an interactive
 * transaction exactly as they do outside one, and the extension arguments
 * carry no flag distinguishing the two (verified against Prisma 7.9). Retrying
 * in there is the wrong thing to do twice over:
 *
 *   - The backoff sleeps while the transaction holds its locks and burns its
 *     deadline. Prisma aborts an interactive transaction after 5s by default,
 *     so a retry that *succeeds* can still push the transaction past the limit
 *     and roll back work that would otherwise have committed.
 *   - When the failure is the session dying — which is what a killed Accelerate
 *     worker does — every retry runs against a connection the server has
 *     already discarded, so it fails three times instead of once.
 *
 * There are ~25 `prisma.$transaction(async …)` call sites in this repo,
 * several with reads inside (e.g. `src/lib/ppt-comment-attachments.ts`, on the
 * PPT proof submit path), so this is not hypothetical. The scope is set by the
 * `$transaction` wrapper in prisma.ts.
 */
const transactionScope = new AsyncLocalStorage<true>();

export function runInTransactionScope<T>(callback: () => T): T {
  return transactionScope.run(true, callback);
}

export function isInTransactionScope(): boolean {
  return transactionScope.getStore() === true;
}

export const RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 120;

const RETRY_BACKOFF_FACTOR = 3;
/** ±25%, so a burst of parallel queries does not retry in lockstep. */
const RETRY_JITTER = 0.25;

export type RetryAttemptInfo = {
  attempt: number;
  attempts: number;
  delayMs: number;
  error: unknown;
};

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  onRetry?: (info: RetryAttemptInfo) => void;
  /** Injectable for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests; defaults to Math.random. */
  random?: () => number;
};

export function retryDelayMs(
  attempt: number,
  baseDelayMs: number,
  random: () => number,
): number {
  const backoff = baseDelayMs * RETRY_BACKOFF_FACTOR ** (attempt - 1);
  const jitter = 1 - RETRY_JITTER + random() * RETRY_JITTER * 2;
  return Math.round(backoff * jitter);
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying only transient database failures. Worst case with the
 * defaults is two extra attempts and roughly half a second of added latency —
 * small enough to sit inside a page render, large enough to outlive a worker
 * being recycled.
 */
export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? RETRY_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? RETRY_BASE_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !isTransientDatabaseError(error)) throw error;

      const delayMs = retryDelayMs(attempt, baseDelayMs, random);
      options.onRetry?.({ attempt, attempts, delayMs, error });
      await sleep(delayMs);
    }
  }
}
