import { callPawaPay } from "./pawapayClient.ts";
import { createServiceRoleClient } from "./supabaseClient.ts";

const PAYOUT_BALANCE_CACHE_KEY = "float:payout_balance_usd";
const PAYOUT_BALANCE_CACHE_TTL_SECONDS = 300; // 5 minutes

type FloatAlertLevel = "ok" | "warning" | "critical";

interface BalanceRecord {
  wallet?: string;
  walletType?: string;
  type?: string;
  currency?: string;
  balance?: string | number;
  availableBalance?: string | number;
  amount?: string | number;
}

interface FloatAssessment {
  payoutBalanceUsd: number;
  level: FloatAlertLevel;
  blocked: boolean;
  source: "cache" | "api" | "fallback";
}

const inMemoryCache = new Map<string, { value: string; expiresAtMs: number }>();

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isPayoutWallet(record: BalanceRecord): boolean {
  const marker = `${record.wallet ?? ""} ${record.walletType ?? ""} ${record.type ?? ""}`
    .toLowerCase();
  return marker.includes("payout");
}

function isUsd(record: BalanceRecord): boolean {
  return (record.currency ?? "USD").toUpperCase() === "USD";
}

function extractPayoutBalanceUsd(payload: unknown): number | null {
  const records: BalanceRecord[] = [];
  if (Array.isArray(payload)) {
    records.push(...(payload as BalanceRecord[]));
  } else if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.balances)) {
      records.push(...(obj.balances as BalanceRecord[]));
    } else {
      records.push(obj as BalanceRecord);
    }
  }

  for (const record of records) {
    if (!isUsd(record) || !isPayoutWallet(record)) {
      continue;
    }
    const value = parseNumber(record.availableBalance) ??
      parseNumber(record.balance) ??
      parseNumber(record.amount);
    if (value !== null) {
      return value;
    }
  }

  // Fallback: first USD balance if payout marker is missing.
  for (const record of records) {
    if (!isUsd(record)) {
      continue;
    }
    const value = parseNumber(record.availableBalance) ??
      parseNumber(record.balance) ??
      parseNumber(record.amount);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

async function cacheGet(key: string): Promise<string | null> {
  const cached = inMemoryCache.get(key);
  if (!cached || cached.expiresAtMs <= Date.now()) {
    return null;
  }
  return cached.value;
}

async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  inMemoryCache.set(key, {
    value,
    expiresAtMs: Date.now() + ttlSeconds * 1000,
  });
}

async function logFloatAlert(
  level: FloatAlertLevel,
  payoutBalanceUsd: number,
): Promise<void> {
  if (level === "ok") {
    return;
  }

  const supabase = createServiceRoleClient();
  await supabase.from("error_logs").insert({
    error_type: level === "critical"
      ? "ADMIN_ALERT_FLOAT_CRITICAL"
      : "ADMIN_ALERT_FLOAT_WARNING",
    error_message: `Payout wallet balance ${payoutBalanceUsd.toFixed(2)} USD (${level})`,
    error_details: {
      component: "float-monitor",
      payout_balance_usd: payoutBalanceUsd,
      level,
    },
  });
}

export async function assessPayoutFloat(input?: {
  forceRefresh?: boolean;
}): Promise<FloatAssessment> {
  const forceRefresh = input?.forceRefresh ?? false;
  if (!forceRefresh) {
    const cached = await cacheGet(PAYOUT_BALANCE_CACHE_KEY);
    if (cached) {
      const parsed = Number.parseFloat(cached);
      if (Number.isFinite(parsed)) {
        return {
          payoutBalanceUsd: parsed,
          level: parsed < 500 ? "critical" : parsed < 1000 ? "warning" : "ok",
          blocked: parsed < 500,
          source: "cache",
        };
      }
    }
  }

  const fallbackBalanceUsd = Number.parseFloat(
    Deno.env.get("PAWAPAY_FLOAT_FALLBACK_USD") ?? "1000",
  );

  try {
    const result = await callPawaPay<unknown>({
      method: "GET",
      path: "/v1/balances",
    });

    if (!result.ok) {
      throw new Error(`Failed to query PawaPay balances: ${result.status}`);
    }

    const extracted = extractPayoutBalanceUsd(result.data);
    if (extracted === null) {
      throw new Error("Unable to extract payout balance from PawaPay balances payload.");
    }

    await cacheSet(
      PAYOUT_BALANCE_CACHE_KEY,
      extracted.toString(),
      PAYOUT_BALANCE_CACHE_TTL_SECONDS,
    );

    const level: FloatAlertLevel = extracted < 500
      ? "critical"
      : extracted < 1000
      ? "warning"
      : "ok";

    await logFloatAlert(level, extracted);

    return {
      payoutBalanceUsd: extracted,
      level,
      blocked: extracted < 500,
      source: "api",
    };
  } catch (error) {
    const safeFallback = Number.isFinite(fallbackBalanceUsd) && fallbackBalanceUsd > 0
      ? fallbackBalanceUsd
      : 1000;
    const fallbackLevel: FloatAlertLevel = safeFallback < 500
      ? "critical"
      : safeFallback < 1000
      ? "warning"
      : "ok";

    const supabase = createServiceRoleClient();
    await supabase.from("error_logs").insert({
      error_type: "PAWAPAY_BALANCE_FALLBACK_USED",
      error_message: error instanceof Error ? error.message : "Unknown balance lookup error",
      error_details: {
        component: "float-monitor",
        fallback_balance_usd: safeFallback,
      },
    });

    return {
      payoutBalanceUsd: safeFallback,
      level: fallbackLevel,
      blocked: safeFallback < 500,
      source: "fallback",
    };
  }
}
