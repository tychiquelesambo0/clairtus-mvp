import { callPawaPay } from "./pawapayClient.ts";
import { createServiceRoleClient } from "./supabaseClient.ts";

type RefundReason = "TTL_EXPIRED" | "USER_CANCELLED";

interface RefundApiResponse {
  refundId?: string;
  id?: string;
  status?: string;
}

interface RefundCandidateRecord {
  id: string;
  status: string;
  buyer_phone: string;
  seller_phone: string;
  base_amount: number;
  currency: string;
  pawapay_refund_id: string | null;
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function extractRefundId(response: RefundApiResponse | null): string | null {
  if (!response) {
    return null;
  }
  const candidate = response.refundId ?? response.id ?? null;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

export async function initiateRefundForTransaction(input: {
  transactionId: string;
  reason: RefundReason;
}): Promise<Record<string, unknown>> {
  const supabase = createServiceRoleClient();
  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select(
      "id, status, buyer_phone, seller_phone, base_amount, currency, pawapay_refund_id",
    )
    .eq("id", input.transactionId)
    .single();

  if (txError || !transaction) {
    throw new Error("Transaction not found for refund initiation.");
  }

  const tx = transaction as RefundCandidateRecord;
  if (tx.currency !== "USD") {
    throw new Error("Refund initiation supports USD only.");
  }

  // Refund uses base_amount only (MNO fee is non-refundable by design).
  const refundAmount = roundToCents(tx.base_amount);
  if (refundAmount <= 0) {
    throw new Error("Invalid refund amount.");
  }

  const requestBody = {
    refundId: tx.id,
    amount: refundAmount.toFixed(2),
    currency: "USD",
    customerTimestamp: new Date().toISOString(),
    statementDescription: `Clairtus refund ${tx.id.slice(0, 8)}`,
    reason: input.reason,
  };

  const result = await callPawaPay<RefundApiResponse>({
    method: "POST",
    path: "/v1/refunds",
    transactionId: tx.id,
    body: requestBody,
  });

  if (!result.ok && !result.duplicateDetected) {
    throw new Error(
      `Refund initiation failed with status ${result.status}: ${result.rawBody}`,
    );
  }

  const refundId = extractRefundId(result.data) ?? tx.pawapay_refund_id;
  if (refundId && refundId !== tx.pawapay_refund_id) {
    const { error: updateError } = await supabase
      .from("transactions")
      .update({ pawapay_refund_id: refundId })
      .eq("id", tx.id);
    if (updateError) {
      throw new Error(`Failed to persist pawapay_refund_id: ${updateError.message}`);
    }
  }

  await supabase.from("transaction_status_log").insert({
    transaction_id: tx.id,
    old_status: tx.status,
    new_status: tx.status,
    event: `REFUND_INITIATED_${input.reason}`,
    reason: "PawaPay refund initiated",
    changed_by: "REFUND_FLOW",
  });

  return {
    transaction_id: tx.id,
    reason: input.reason,
    idempotency_key: result.idempotencyKey,
    refund_amount: refundAmount,
    pawapay_refund_id: refundId,
    duplicate_detected: result.duplicateDetected,
    attempt_count: result.attemptCount,
  };
}
