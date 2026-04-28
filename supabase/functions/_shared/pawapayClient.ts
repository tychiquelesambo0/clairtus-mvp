import { createServiceRoleClient } from "./supabaseClient.ts";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_RETRY_DELAY_MS = 500;

interface PawaPayClientConfig {
  baseUrl: string;
  bearerToken: string;
  timeoutMs: number;
  maxRetries: number;
  baseRetryDelayMs: number;
}

interface PawaPayRequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  transactionId?: string;
  body?: Record<string, unknown> | unknown[];
  timeoutMs?: number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
  headers?: Record<string, string>;
}

interface PawaPayApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  rawBody: string;
  idempotencyKey: string | null;
  duplicateDetected: boolean;
  attemptCount: number;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) {
    return null;
  }

  const asSeconds = Number.parseInt(retryAfter, 10);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDate = new Date(retryAfter).getTime();
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return null;
}

async function logPawaPayError(
  errorType: string,
  errorMessage: string,
  details: Record<string, unknown>,
  transactionId: string | null,
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("error_logs").insert({
      transaction_id: transactionId,
      error_type: errorType,
      error_message: errorMessage,
      error_details: details,
    });
  } catch {
    // Do not throw from logger.
  }
}

function loadConfig(): PawaPayClientConfig {
  const baseUrl = Deno.env.get("PAWAPAY_BASE_URL");
  const bearerToken = Deno.env.get("PAWAPAY_API_KEY");
  if (!baseUrl || !bearerToken) {
    throw new Error("Missing PAWAPAY_BASE_URL or PAWAPAY_API_KEY");
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    bearerToken,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
    baseRetryDelayMs: DEFAULT_BASE_RETRY_DELAY_MS,
  };
}

export function buildPawaPayIdempotencyKey(transactionId: string): string {
  if (!isUuid(transactionId)) {
    throw new Error("Idempotency key must be a valid transaction UUID.");
  }
  return transactionId;
}

function shouldRetry(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status <= 599);
}

function detectDuplicate(status: number, rawBody: string): boolean {
  if (status === 409) {
    return true;
  }
  const lowered = rawBody.toLowerCase();
  return lowered.includes("duplicate") || lowered.includes("already exists");
}

export async function callPawaPay<T>(
  options: PawaPayRequestOptions,
): Promise<PawaPayApiResult<T>> {
  const config = loadConfig();
  const timeoutMs = options.timeoutMs ?? config.timeoutMs;
  const maxRetries = options.maxRetries ?? config.maxRetries;
  const baseRetryDelayMs = options.baseRetryDelayMs ?? config.baseRetryDelayMs;

  const idempotencyKey = options.transactionId
    ? buildPawaPayIdempotencyKey(options.transactionId)
    : null;

  let attempt = 0;
  let lastStatus = 0;
  let lastRawBody = "";

  while (attempt <= maxRetries) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const requestHeaders: Record<string, string> = {
        Authorization: `Bearer ${config.bearerToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      };
      if (idempotencyKey) {
        requestHeaders["Idempotency-Key"] = idempotencyKey;
      }

      const response = await fetch(`${config.baseUrl}${options.path}`, {
        method: options.method,
        headers: requestHeaders,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const rawBody = await response.text();
      lastStatus = response.status;
      lastRawBody = rawBody;

      console.log(
        JSON.stringify({
          component: "pawapay-client",
          direction: "response",
          method: options.method,
          path: options.path,
          status: response.status,
          attempt,
          duration_ms: Date.now() - startedAt,
          idempotency_key: idempotencyKey,
        }),
      );

      if (!response.ok && shouldRetry(response.status) && attempt <= maxRetries) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        const computedDelay = retryAfterMs ??
          baseRetryDelayMs * Math.pow(2, attempt - 1);
        await sleep(computedDelay);
        continue;
      }

      if (!response.ok) {
        await logPawaPayError(
          "PAWAPAY_API_ERROR",
          `PawaPay returned HTTP ${response.status}`,
          {
            method: options.method,
            path: options.path,
            status: response.status,
            attempt,
            response_body: rawBody,
            idempotency_key: idempotencyKey,
          },
          options.transactionId ?? null,
        );
      }

      let parsed: T | null = null;
      if (rawBody.trim().length > 0) {
        try {
          parsed = JSON.parse(rawBody) as T;
        } catch {
          parsed = null;
        }
      }

      return {
        ok: response.ok,
        status: response.status,
        data: parsed,
        rawBody,
        idempotencyKey,
        duplicateDetected: detectDuplicate(response.status, rawBody),
        attemptCount: attempt,
      };
    } catch (error) {
      clearTimeout(timer);
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const message = error instanceof Error ? error.message : "Unknown fetch error";

      console.log(
        JSON.stringify({
          component: "pawapay-client",
          direction: "error",
          method: options.method,
          path: options.path,
          attempt,
          timeout_ms: timeoutMs,
          idempotency_key: idempotencyKey,
          error: message,
          timeout: isAbort,
        }),
      );

      if (attempt <= maxRetries) {
        const delayMs = baseRetryDelayMs * Math.pow(2, attempt - 1);
        await sleep(delayMs);
        continue;
      }

      await logPawaPayError(
        "PAWAPAY_API_REQUEST_FAILED",
        message,
        {
          method: options.method,
          path: options.path,
          attempt,
          timeout_ms: timeoutMs,
          idempotency_key: idempotencyKey,
        },
        options.transactionId ?? null,
      );

      throw new Error(
        `PawaPay request failed after ${attempt} attempt(s): ${message}`,
      );
    }
  }

  return {
    ok: false,
    status: lastStatus,
    data: null,
    rawBody: lastRawBody,
    idempotencyKey,
    duplicateDetected: detectDuplicate(lastStatus, lastRawBody),
    attemptCount: maxRetries + 1,
  };
}
