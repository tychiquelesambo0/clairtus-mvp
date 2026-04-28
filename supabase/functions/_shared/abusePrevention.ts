import { createServiceRoleClient } from "./supabaseClient.ts";

const HOURLY_RATE_LIMIT = 5;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const AUTO_SUSPEND_PIN_LOCK_THRESHOLD = 3;

export async function enforceUserHourlyRateLimit(
  phoneNumberE164: string,
): Promise<{ allowed: boolean; count: number; limit: number; remaining: number }> {
  const supabase = createServiceRoleClient();
  const sinceIso = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  const { count: existingCount, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("initiator_phone", phoneNumberE164)
    .gte("created_at", sinceIso);

  if (error) {
    throw new Error(`Unable to evaluate rate limit for ${phoneNumberE164}: ${error.message}`);
  }

  // Include the in-flight create_transaction attempt in limit evaluation.
  const count = (existingCount ?? 0) + 1;
  const remaining = Math.max(0, HOURLY_RATE_LIMIT - count);

  return {
    allowed: count <= HOURLY_RATE_LIMIT,
    count,
    limit: HOURLY_RATE_LIMIT,
    remaining,
  };
}

export async function isUserSuspended(phoneNumberE164: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("users")
    .select("is_suspended")
    .eq("phone_number", phoneNumberE164)
    .single();

  if (error || !data) {
    throw new Error(`Unable to check suspension status for ${phoneNumberE164}`);
  }

  return Boolean((data as { is_suspended: boolean }).is_suspended);
}

export async function setUserSuspension(
  phoneNumberE164: string,
  isSuspended: boolean,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("users")
    .update({ is_suspended: isSuspended })
    .eq("phone_number", phoneNumberE164);

  if (error) {
    throw new Error(
      `Unable to set suspension=${isSuspended} for ${phoneNumberE164}: ${error.message}`,
    );
  }
}

export async function autoSuspendUserIfNeeded(
  phoneNumberE164: string,
): Promise<{ suspended: boolean; pinLockedCount: number }> {
  const supabase = createServiceRoleClient();
  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("status", "PIN_FAILED_LOCKED")
    .eq("seller_phone", phoneNumberE164);

  if (error) {
    throw new Error(
      `Unable to evaluate auto-suspension for ${phoneNumberE164}: ${error.message}`,
    );
  }

  const pinLockedCount = count ?? 0;
  if (pinLockedCount >= AUTO_SUSPEND_PIN_LOCK_THRESHOLD) {
    await setUserSuspension(phoneNumberE164, true);
    return { suspended: true, pinLockedCount };
  }

  return { suspended: false, pinLockedCount };
}
