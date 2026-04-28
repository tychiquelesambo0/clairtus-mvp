import { createServiceRoleClient } from "./supabaseClient.ts";

const TRUST_SCORE_CACHE_TTL_MS = 60_000;

export interface TrustScore {
  phoneNumber: string;
  successfulTransactions: number;
  cancelledTransactions: number;
  displayText: string;
  isNewUser: boolean;
  source: "cache" | "database";
  latencyMs: number;
}

interface TrustScoreCacheEntry {
  expiresAtMs: number;
  value: TrustScore;
}

interface UserTrustRow {
  successful_transactions: number;
  cancelled_transactions: number;
}

const trustScoreCache = new Map<string, TrustScoreCacheEntry>();

function formatTrustScore(
  successfulTransactions: number,
  cancelledTransactions: number,
): { displayText: string; isNewUser: boolean } {
  const isNewUser = successfulTransactions === 0 && cancelledTransactions === 0;
  if (isNewUser) {
    return {
      displayText: "🆕 Nouveau utilisateur - Aucun historique",
      isNewUser: true,
    };
  }

  return {
    displayText:
      `🟢 ${successfulTransactions} ventes réussies | ❌ ${cancelledTransactions} annulations`,
    isNewUser: false,
  };
}

export async function getTrustScoreByPhone(phoneNumber: string): Promise<TrustScore> {
  const startedAt = Date.now();
  const now = Date.now();
  const cached = trustScoreCache.get(phoneNumber);

  if (cached && cached.expiresAtMs > now) {
    return {
      ...cached.value,
      source: "cache",
      latencyMs: Date.now() - startedAt,
    };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("users")
    .select("successful_transactions, cancelled_transactions")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load trust score: ${error.message}`);
  }

  const row = (data as UserTrustRow | null) ?? {
    successful_transactions: 0,
    cancelled_transactions: 0,
  };

  const formatted = formatTrustScore(
    row.successful_transactions,
    row.cancelled_transactions,
  );

  const trustScore: TrustScore = {
    phoneNumber,
    successfulTransactions: row.successful_transactions,
    cancelledTransactions: row.cancelled_transactions,
    displayText: formatted.displayText,
    isNewUser: formatted.isNewUser,
    source: "database",
    latencyMs: Date.now() - startedAt,
  };

  trustScoreCache.set(phoneNumber, {
    expiresAtMs: now + TRUST_SCORE_CACHE_TTL_MS,
    value: trustScore,
  });

  return trustScore;
}

export async function getTrustScoresForParties(
  sellerPhone: string,
  buyerPhone: string,
): Promise<{ seller: TrustScore; buyer: TrustScore }> {
  const [seller, buyer] = await Promise.all([
    getTrustScoreByPhone(sellerPhone),
    getTrustScoreByPhone(buyerPhone),
  ]);

  return { seller, buyer };
}
