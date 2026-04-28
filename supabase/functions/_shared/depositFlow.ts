import { callPawaPay } from "./pawapayClient.ts";
import { createServiceRoleClient } from "./supabaseClient.ts";
import { sendWhatsAppTextMessage } from "./whatsappMessaging.ts";

interface DepositApiResponse {
  depositId?: string;
  id?: string;
  redirectUrl?: string;
  checkoutUrl?: string;
  paymentPageUrl?: string;
}

interface DepositCandidateRecord {
  id: string;
  status: string;
  buyer_phone: string;
  seller_phone: string;
  base_amount: number;
  mno_fee: number;
  pawapay_deposit_id: string | null;
  currency: string;
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function extractDepositId(response: DepositApiResponse | null): string | null {
  if (!response) {
    return null;
  }
  const candidate = response.depositId ?? response.id ?? null;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function extractCheckoutUrl(response: DepositApiResponse | null): string | null {
  if (!response) {
    return null;
  }
  const candidate = response.paymentPageUrl ?? response.redirectUrl ?? response.checkoutUrl ?? null;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function resolveDepositCorrespondent(): string {
  return Deno.env.get("PAWAPAY_DEPOSIT_CORRESPONDENT") ??
    Deno.env.get("PAWAPAY_CORRESPONDENT") ??
    "MTN_MOMO_COD";
}

export async function initiateDepositForTransaction(
  transactionId: string,
): Promise<Record<string, unknown>> {
  const supabase = createServiceRoleClient();
  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select(
      "id, status, buyer_phone, seller_phone, base_amount, mno_fee, pawapay_deposit_id, currency",
    )
    .eq("id", transactionId)
    .single();

  if (txError || !transaction) {
    throw new Error("Transaction not found for deposit initiation.");
  }

  const tx = transaction as DepositCandidateRecord;
  if (tx.status !== "PENDING_FUNDING") {
    throw new Error(
      `Deposit initiation is only allowed in PENDING_FUNDING. Current status: ${tx.status}`,
    );
  }
  if (tx.currency !== "USD") {
    throw new Error("Deposit initiation supports USD only.");
  }

  const depositAmount = roundToCents(tx.base_amount + tx.mno_fee);
  const requestBody = {
    depositId: tx.id,
    amount: depositAmount.toFixed(2),
    currency: "USD",
    correspondent: resolveDepositCorrespondent(),
    payer: {
      type: "MSISDN",
      address: {
        value: tx.buyer_phone,
      },
    },
    customerTimestamp: new Date().toISOString(),
    statementDescription: `Clairtus escrow ${tx.id.slice(0, 8)}`,
  };

  const result = await callPawaPay<DepositApiResponse>({
    method: "POST",
    path: "/v1/deposits",
    transactionId: tx.id,
    body: requestBody,
  });

  if (!result.ok && !result.duplicateDetected) {
    throw new Error(
      `Deposit initiation failed with status ${result.status}: ${result.rawBody}`,
    );
  }

  const depositId = extractDepositId(result.data) ?? tx.pawapay_deposit_id;
  const checkoutUrl = extractCheckoutUrl(result.data);

  if (depositId && depositId !== tx.pawapay_deposit_id) {
    const { error: updateError } = await supabase
      .from("transactions")
      .update({ pawapay_deposit_id: depositId })
      .eq("id", tx.id);
    if (updateError) {
      throw new Error(`Failed to persist pawapay_deposit_id: ${updateError.message}`);
    }
  }

  let buyerMessageSent = false;
  if (checkoutUrl) {
    const message = [
      "💳 Paiement requis",
      "",
      "Pour sécuriser vos fonds, ouvrez ce lien :",
      checkoutUrl,
      "",
      "🔒 Clairtus protège votre paiement jusqu'à la confirmation de livraison.",
    ].join("\n");
    const sendResult = await sendWhatsAppTextMessage({
      recipientPhoneE164: tx.buyer_phone,
      messageText: message,
      transactionId: tx.id,
    });
    buyerMessageSent = sendResult.sent;
  }

  return {
    transaction_id: tx.id,
    idempotency_key: result.idempotencyKey,
    deposit_amount: depositAmount,
    pawapay_deposit_id: depositId,
    checkout_url: checkoutUrl,
    duplicate_detected: result.duplicateDetected,
    attempt_count: result.attemptCount,
    buyer_message_sent: buyerMessageSent,
  };
}
