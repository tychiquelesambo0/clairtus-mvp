import { callPawaPay } from "./pawapayClient.ts";
import { createServiceRoleClient } from "./supabaseClient.ts";
import {
  buildPayoutRetryButtons,
  sendInteractiveButtonsMessage,
} from "./whatsappInteractive.ts";
import { sendWhatsAppTextMessage } from "./whatsappMessaging.ts";

interface PayoutApiResponse {
  payoutId?: string;
  id?: string;
  status?: string;
  errorCode?: string;
  message?: string;
}

interface PayoutCandidateRecord {
  id: string;
  status: string;
  seller_phone: string;
  base_amount: number;
  clairtus_fee: number;
  pawapay_payout_id: string | null;
  currency: string;
}

type PayoutErrorScenario =
  | "NONE"
  | "RECEIVER_LIMIT_EXCEEDED"
  | "MNO_TIMEOUT"
  | "DUPLICATE"
  | "UNKNOWN";

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function extractPayoutId(response: PayoutApiResponse | null): string | null {
  if (!response) {
    return null;
  }
  const candidate = response.payoutId ?? response.id ?? null;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function classifyPayoutError(
  status: number,
  rawBody: string,
  duplicateDetected: boolean,
): PayoutErrorScenario {
  if (duplicateDetected) {
    return "DUPLICATE";
  }

  const lowered = rawBody.toLowerCase();
  if (lowered.includes("receiver_limit_exceeded")) {
    return "RECEIVER_LIMIT_EXCEEDED";
  }
  if (status === 503 || lowered.includes("timeout") || lowered.includes("timed out")) {
    return "MNO_TIMEOUT";
  }
  if (status >= 400) {
    return "UNKNOWN";
  }
  return "NONE";
}

function resolvePayoutCorrespondent(): string {
  return Deno.env.get("PAWAPAY_PAYOUT_CORRESPONDENT") ??
    Deno.env.get("PAWAPAY_CORRESPONDENT") ??
    "MTN_MOMO_COD";
}

async function transitionToStatus(
  transactionId: string,
  fromStatus: string,
  toStatus: string,
  event: string,
  reason: string,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update({ status: toStatus })
    .eq("id", transactionId)
    .eq("status", fromStatus)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    return false;
  }

  await supabase.from("transaction_status_log").insert({
    transaction_id: transactionId,
    old_status: fromStatus,
    new_status: toStatus,
    event,
    reason,
    changed_by: "PAYOUT_FLOW",
  });
  return true;
}

export async function initiatePayoutForTransaction(
  transactionId: string,
): Promise<Record<string, unknown>> {
  const supabase = createServiceRoleClient();
  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select(
      "id, status, seller_phone, base_amount, clairtus_fee, pawapay_payout_id, currency",
    )
    .eq("id", transactionId)
    .single();

  if (txError || !transaction) {
    throw new Error("Transaction not found for payout initiation.");
  }

  const tx = transaction as PayoutCandidateRecord;
  if (!["SECURED", "PAYOUT_FAILED", "PAYOUT_DELAYED"].includes(tx.status)) {
    throw new Error(
      `Payout initiation is not allowed from status ${tx.status}.`,
    );
  }
  if (tx.currency !== "USD") {
    throw new Error("Payout initiation supports USD only.");
  }

  const payoutAmount = roundToCents(tx.base_amount - tx.clairtus_fee);
  if (payoutAmount <= 0) {
    throw new Error("Invalid payout amount after fee deduction.");
  }

  const requestBody = {
    payoutId: tx.id,
    amount: payoutAmount.toFixed(2),
    currency: "USD",
    correspondent: resolvePayoutCorrespondent(),
    recipient: {
      type: "MSISDN",
      address: {
        value: tx.seller_phone,
      },
    },
    customerTimestamp: new Date().toISOString(),
    statementDescription: `Clairtus payout ${tx.id.slice(0, 8)}`,
  };

  const result = await callPawaPay<PayoutApiResponse>({
    method: "POST",
    path: "/v1/payouts",
    transactionId: tx.id,
    body: requestBody,
  });

  const errorScenario = classifyPayoutError(
    result.status,
    result.rawBody,
    result.duplicateDetected,
  );

  if (!result.ok && !result.duplicateDetected) {
    let transitionedToStatus: string | null = null;
    let retryPromptSent = false;
    let reassuranceSent = false;

    if (errorScenario === "RECEIVER_LIMIT_EXCEEDED") {
      const transitioned = await transitionToStatus(
        tx.id,
        tx.status,
        "PAYOUT_FAILED",
        "PAYOUT_HARD_FAILED",
        "Payout failed with RECEIVER_LIMIT_EXCEEDED",
      );
      if (transitioned) {
        transitionedToStatus = "PAYOUT_FAILED";
      }

      const interactiveResult = await sendInteractiveButtonsMessage({
        recipientPhoneE164: tx.seller_phone,
        bodyText:
          "⚠️ Votre compte Mobile Money a atteint sa limite.\n\nVidez votre compte puis appuyez sur « RÉESSAYER ».",
        buttons: buildPayoutRetryButtons(tx.id),
      });
      retryPromptSent = interactiveResult.sent;
    } else if (errorScenario === "MNO_TIMEOUT") {
      const transitioned = await transitionToStatus(
        tx.id,
        tx.status,
        "PAYOUT_DELAYED",
        "PAYOUT_TIMEOUT",
        "Payout delayed due to network timeout/unavailability",
      );
      if (transitioned) {
        transitionedToStatus = "PAYOUT_DELAYED";
      }

      const reassuranceResult = await sendWhatsAppTextMessage({
        recipientPhoneE164: tx.seller_phone,
        transactionId: tx.id,
        messageText:
          "✅ Code valide.\n\nLe réseau Mobile Money est temporairement lent.\nVos fonds restent sécurisés et le transfert reprendra automatiquement.",
      });
      reassuranceSent = reassuranceResult.sent;
    }

    return {
      transaction_id: tx.id,
      initiated: false,
      idempotency_key: result.idempotencyKey,
      payout_amount: payoutAmount,
      error_scenario: errorScenario,
      transitioned_to_status: transitionedToStatus,
      retry_prompt_sent: retryPromptSent,
      reassurance_sent: reassuranceSent,
      status_code: result.status,
      response_body: result.rawBody,
      attempt_count: result.attemptCount,
    };
  }

  const payoutId = extractPayoutId(result.data) ?? tx.pawapay_payout_id;
  if (payoutId && payoutId !== tx.pawapay_payout_id) {
    const { error: updateError } = await supabase
      .from("transactions")
      .update({ pawapay_payout_id: payoutId })
      .eq("id", tx.id);
    if (updateError) {
      throw new Error(`Failed to persist pawapay_payout_id: ${updateError.message}`);
    }
  }

  return {
    transaction_id: tx.id,
    initiated: true,
    idempotency_key: result.idempotencyKey,
    payout_amount: payoutAmount,
    pawapay_payout_id: payoutId,
    duplicate_detected: result.duplicateDetected,
    error_scenario: errorScenario,
    status_code: result.status,
    attempt_count: result.attemptCount,
  };
}
