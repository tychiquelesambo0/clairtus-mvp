import { serve } from "@std/http/server";
import { jsonResponse } from "../_shared/http.ts";
import { generateSecure4DigitPin } from "../_shared/pin.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";
import { sendWhatsAppTextMessage } from "../_shared/whatsappMessaging.ts";

type PawaPayEventType = "deposit" | "payout" | "refund" | "unknown";

interface ParsedPawaPayWebhook {
  eventType: PawaPayEventType;
  transactionId: string | null;
  externalId: string | null;
  status: string | null;
}

interface DepositTransactionRow {
  id: string;
  status: string;
  buyer_phone: string;
  seller_phone: string;
  base_amount: number;
  secret_pin: string | null;
  pawapay_deposit_id: string | null;
}

interface PayoutTransactionRow {
  id: string;
  status: string;
  buyer_phone: string;
  seller_phone: string;
  base_amount: number;
  clairtus_fee: number;
  pawapay_payout_id: string | null;
  item_description: string | null;
}

interface RefundTransactionRow {
  id: string;
  status: string;
  buyer_phone: string;
  seller_phone: string;
  pawapay_refund_id: string | null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

function normalizeSignature(signatureHeader: string): string {
  const trimmed = signatureHeader.trim();
  const match = /^sha(256|512)=([a-fA-F0-9]+)$/i.exec(trimmed);
  if (match) {
    return match[2].toLowerCase();
  }
  return trimmed.toLowerCase();
}

async function computeHmacHex(
  payload: Uint8Array,
  secret: string,
  hash: "SHA-256" | "SHA-512",
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash },
    false,
    ["sign"],
  );
  const digestBuffer = await crypto.subtle.sign("HMAC", key, payload);
  return bytesToHex(new Uint8Array(digestBuffer));
}

async function isValidPawaPaySignature(
  payload: Uint8Array,
  providedSignature: string,
  secret: string,
): Promise<boolean> {
  const normalizedProvided = normalizeSignature(providedSignature);
  const computedSha256 = await computeHmacHex(payload, secret, "SHA-256");
  if (constantTimeEquals(normalizedProvided, computedSha256)) {
    return true;
  }

  // Some PawaPay setups document SHA-512 webhook signatures.
  const computedSha512 = await computeHmacHex(payload, secret, "SHA-512");
  return constantTimeEquals(normalizedProvided, computedSha512);
}

async function logWebhookError(
  errorType: string,
  errorMessage: string,
  errorDetails: Record<string, unknown>,
  transactionId: string | null = null,
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("error_logs").insert({
      transaction_id: transactionId,
      error_type: errorType,
      error_message: errorMessage,
      error_details: errorDetails,
    });
  } catch {
    // Never block callback acknowledgment if logging fails.
  }
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function extractFirstString(
  source: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const candidate = source[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

function extractIdempotencyKey(source: Record<string, unknown>): string | null {
  const direct = extractFirstString(source, [
    "idempotencyKey",
    "idempotency_key",
    "merchantRequestId",
    "merchantTransactionId",
    "referenceId",
  ]);
  if (direct) {
    return direct;
  }

  const correspondentIds = source.correspondentIds;
  if (
    correspondentIds &&
    typeof correspondentIds === "object" &&
    !Array.isArray(correspondentIds)
  ) {
    const nested = extractFirstString(
      correspondentIds as Record<string, unknown>,
      ["idempotencyKey", "idempotency_key", "merchantRequestId", "referenceId"],
    );
    if (nested) {
      return nested;
    }
  }

  const metadata = source.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const nested = extractFirstString(
      metadata as Record<string, unknown>,
      ["idempotencyKey", "idempotency_key", "transactionId"],
    );
    if (nested) {
      return nested;
    }
  }

  return null;
}

function detectEventType(source: Record<string, unknown>): PawaPayEventType {
  const lowerType = extractFirstString(source, ["type", "eventType"])?.toLowerCase();
  if (lowerType?.includes("deposit")) {
    return "deposit";
  }
  if (lowerType?.includes("payout")) {
    return "payout";
  }
  if (lowerType?.includes("refund")) {
    return "refund";
  }

  if ("depositId" in source) {
    return "deposit";
  }
  if ("payoutId" in source) {
    return "payout";
  }
  if ("refundId" in source) {
    return "refund";
  }

  return "unknown";
}

function extractExternalId(
  source: Record<string, unknown>,
  eventType: PawaPayEventType,
): string | null {
  if (eventType === "deposit") {
    return extractFirstString(source, ["depositId", "id", "transactionId"]);
  }
  if (eventType === "payout") {
    return extractFirstString(source, ["payoutId", "id", "transactionId"]);
  }
  if (eventType === "refund") {
    return extractFirstString(source, ["refundId", "id", "transactionId"]);
  }
  return extractFirstString(source, ["id", "transactionId"]);
}

function parseWebhookRecords(payload: unknown): ParsedPawaPayWebhook[] {
  const records: ParsedPawaPayWebhook[] = [];

  const items: unknown[] = [];
  if (Array.isArray(payload)) {
    items.push(...payload);
  } else if (payload && typeof payload === "object") {
    const payloadRecord = payload as Record<string, unknown>;
    const deposits = payloadRecord.deposits;
    const payouts = payloadRecord.payouts;
    const refunds = payloadRecord.refunds;

    if (Array.isArray(deposits)) {
      items.push(...deposits);
    }
    if (Array.isArray(payouts)) {
      items.push(...payouts);
    }
    if (Array.isArray(refunds)) {
      items.push(...refunds);
    }

    if (items.length === 0) {
      items.push(payload);
    }
  }

  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const source = item as Record<string, unknown>;
    const eventType = detectEventType(source);
    const idempotencyKey = extractIdempotencyKey(source);
    const transactionId = idempotencyKey && isValidUuid(idempotencyKey)
      ? idempotencyKey
      : null;

    records.push({
      eventType,
      transactionId,
      externalId: extractExternalId(source, eventType),
      status: extractFirstString(source, ["status", "result", "outcome"]),
    });
  }

  return records;
}

function normalizeStatus(status: string | null): string {
  return (status ?? "").trim().toUpperCase();
}

function isDepositSuccessStatus(status: string): boolean {
  return ["COMPLETED", "SUCCESS", "SUCCESSFUL", "SUCCEEDED"].includes(status);
}

function isDepositFailureStatus(status: string): boolean {
  return [
    "FAILED",
    "FAILURE",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
    "TIMEOUT",
    "TIMED_OUT",
  ].includes(status);
}

async function sendDepositSecuredNotifications(
  transaction: DepositTransactionRow,
  pin: string,
): Promise<void> {
  const amountText = transaction.base_amount.toFixed(2);
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.buyer_phone,
    transactionId: transaction.id,
    messageText:
      `🔐 Paiement sécurisé.\n\nVoici votre code PIN de livraison : ${pin}\n\n⚠️ Ne partagez jamais ce code par téléphone.\nNe le donnez qu'au moment où vous recevez l'article.`,
  });
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.seller_phone,
    transactionId: transaction.id,
    messageText:
      `✅ Fonds sécurisés.\n\nLe client a bloqué ${amountText} USD.\n\nLivrez la commande, puis demandez le code PIN client et envoyez-le ici pour être payé.`,
  });
}

async function sendDepositFailureNotifications(
  transaction: DepositTransactionRow,
): Promise<void> {
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.buyer_phone,
    transactionId: transaction.id,
    messageText:
      "❌ Le paiement Mobile Money a échoué ou a expiré.\n\nLa transaction a été annulée.",
  });
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.seller_phone,
    transactionId: transaction.id,
    messageText:
      "❌ Le paiement de l'acheteur a échoué ou a expiré.\n\nLa transaction est annulée.",
  });
}

async function processDepositWebhookRecord(
  record: ParsedPawaPayWebhook,
): Promise<"processed" | "duplicate" | "ignored"> {
  if (!record.transactionId) {
    return "ignored";
  }

  const supabase = createServiceRoleClient();
  const eventStatus = normalizeStatus(record.status);
  const dedupeEvent =
    `PAWAPAY_DEPOSIT_${record.externalId ?? "NO_ID"}_${eventStatus || "UNKNOWN"}`;

  const { data: existingLog } = await supabase
    .from("transaction_status_log")
    .select("id")
    .eq("transaction_id", record.transactionId)
    .eq("event", dedupeEvent)
    .limit(1)
    .maybeSingle();

  if (existingLog) {
    return "duplicate";
  }

  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select(
      "id, status, buyer_phone, seller_phone, base_amount, secret_pin, pawapay_deposit_id",
    )
    .eq("id", record.transactionId)
    .maybeSingle();

  if (txError || !transaction) {
    return "ignored";
  }

  const tx = transaction as DepositTransactionRow;
  if (record.externalId && !tx.pawapay_deposit_id) {
    await supabase
      .from("transactions")
      .update({ pawapay_deposit_id: record.externalId })
      .eq("id", tx.id);
  }

  if (isDepositSuccessStatus(eventStatus)) {
    let oldStatus = tx.status;
    if (tx.status === "PENDING_FUNDING") {
      const expiresAt72h = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      const { data: updated } = await supabase
        .from("transactions")
        .update({
          status: "SECURED",
          expires_at: expiresAt72h,
        })
        .eq("id", tx.id)
        .eq("status", "PENDING_FUNDING")
        .select("status")
        .maybeSingle();
      oldStatus = "PENDING_FUNDING";
      if (updated) {
        await supabase.from("transaction_status_log").insert({
          transaction_id: tx.id,
          old_status: oldStatus,
          new_status: "SECURED",
          event: "DEPOSIT_CONFIRMED",
          reason: "PawaPay deposit webhook successful",
          changed_by: "PAWAPAY_WEBHOOK",
        });
      }
    }

    let pin = tx.secret_pin;
    if (!pin) {
      pin = generateSecure4DigitPin();
      await supabase
        .from("transactions")
        .update({ secret_pin: pin, pin_attempts: 0 })
        .eq("id", tx.id)
        .is("secret_pin", null);
    }

    try {
      await sendDepositSecuredNotifications(
        {
          ...tx,
          status: "SECURED",
        },
        pin,
      );
    } catch (error) {
      await logWebhookError(
        "DEPOSIT_SECURED_NOTIFICATION_FAILED",
        error instanceof Error ? error.message : "Unknown notification error",
        {
          component: "pawapay-webhook",
          transaction_id: tx.id,
        },
        tx.id,
      );
    }

    await supabase.from("transaction_status_log").insert({
      transaction_id: tx.id,
      old_status: oldStatus,
      new_status: "SECURED",
      event: dedupeEvent,
      reason: "Deposit webhook processed",
      changed_by: "PAWAPAY_WEBHOOK",
    });
    return "processed";
  }

  if (isDepositFailureStatus(eventStatus)) {
    if (tx.status === "PENDING_FUNDING") {
      await supabase
        .from("transactions")
        .update({ status: "CANCELLED" })
        .eq("id", tx.id)
        .eq("status", "PENDING_FUNDING");

      await supabase.from("transaction_status_log").insert({
        transaction_id: tx.id,
        old_status: "PENDING_FUNDING",
        new_status: "CANCELLED",
        event: eventStatus.includes("TIMEOUT")
          ? "DEPOSIT_TIMEOUT"
          : "DEPOSIT_FAILED",
        reason: `Deposit webhook status ${eventStatus || "UNKNOWN"}`,
        changed_by: "PAWAPAY_WEBHOOK",
      });

      try {
        await sendDepositFailureNotifications(tx);
      } catch (error) {
        await logWebhookError(
          "DEPOSIT_FAILURE_NOTIFICATION_FAILED",
          error instanceof Error ? error.message : "Unknown notification error",
          {
            component: "pawapay-webhook",
            transaction_id: tx.id,
          },
          tx.id,
        );
      }
    }

    await supabase.from("transaction_status_log").insert({
      transaction_id: tx.id,
      old_status: tx.status,
      new_status: tx.status === "PENDING_FUNDING" ? "CANCELLED" : tx.status,
      event: dedupeEvent,
      reason: "Deposit failure webhook processed",
      changed_by: "PAWAPAY_WEBHOOK",
    });
    return "processed";
  }

  await supabase.from("transaction_status_log").insert({
    transaction_id: tx.id,
    old_status: tx.status,
    new_status: tx.status,
    event: dedupeEvent,
    reason: "Unhandled deposit webhook status recorded",
    changed_by: "PAWAPAY_WEBHOOK",
  });
  return "ignored";
}

function isPayoutSuccessStatus(status: string): boolean {
  return ["COMPLETED", "SUCCESS", "SUCCESSFUL", "SUCCEEDED"].includes(status);
}

async function incrementSuccessfulTransactions(
  phoneNumber: string,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: user, error } = await supabase
    .from("users")
    .select("successful_transactions")
    .eq("phone_number", phoneNumber)
    .single();

  if (error || !user) {
    throw new Error(`User not found for success increment: ${phoneNumber}`);
  }

  const current = (user as { successful_transactions: number }).successful_transactions;
  const { error: updateError } = await supabase
    .from("users")
    .update({
      successful_transactions: current + 1,
      last_transaction_at: new Date().toISOString(),
    })
    .eq("phone_number", phoneNumber);

  if (updateError) {
    throw new Error(`Failed to increment successful_transactions: ${updateError.message}`);
  }
}

async function sendPayoutCompletionNotifications(
  transaction: PayoutTransactionRow,
): Promise<void> {
  const payoutAmount = (Math.round((transaction.base_amount - transaction.clairtus_fee) * 100) /
    100)
    .toFixed(2);
  const itemLabel = transaction.item_description?.trim() || "votre article";
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.seller_phone,
    transactionId: transaction.id,
    messageText:
      `🎉 Paiement confirmé.\n\nCode PIN validé.\nVos fonds (${payoutAmount} USD) sont en route vers votre compte Mobile Money.`,
  });
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.seller_phone,
    transactionId: transaction.id,
    messageText:
      `👏 Félicitations pour la vente de ${itemLabel}.\n\nContinuez à vendre avec Clairtus pour des transactions toujours sécurisées.`,
  });

  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.buyer_phone,
    transactionId: transaction.id,
    messageText: "✅ Transaction terminée.\n\nLe vendeur a reçu son paiement.",
  });
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.buyer_phone,
    transactionId: transaction.id,
    messageText:
      `🥳 Félicitations pour votre achat de ${itemLabel}.\n\nContinuez à acheter avec Clairtus en toute confiance.`,
  });
}

async function processPayoutWebhookRecord(
  record: ParsedPawaPayWebhook,
): Promise<"processed" | "duplicate" | "ignored"> {
  if (!record.transactionId) {
    return "ignored";
  }

  const supabase = createServiceRoleClient();
  const eventStatus = normalizeStatus(record.status);
  const dedupeEvent =
    `PAWAPAY_PAYOUT_${record.externalId ?? "NO_ID"}_${eventStatus || "UNKNOWN"}`;

  const { data: existingLog } = await supabase
    .from("transaction_status_log")
    .select("id")
    .eq("transaction_id", record.transactionId)
    .eq("event", dedupeEvent)
    .limit(1)
    .maybeSingle();

  if (existingLog) {
    return "duplicate";
  }

  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select(
      "id, status, buyer_phone, seller_phone, base_amount, clairtus_fee, pawapay_payout_id, item_description",
    )
    .eq("id", record.transactionId)
    .maybeSingle();

  if (txError || !transaction) {
    return "ignored";
  }

  const tx = transaction as PayoutTransactionRow;
  if (record.externalId && !tx.pawapay_payout_id) {
    await supabase
      .from("transactions")
      .update({ pawapay_payout_id: record.externalId })
      .eq("id", tx.id);
  }

  if (!isPayoutSuccessStatus(eventStatus)) {
    await supabase.from("transaction_status_log").insert({
      transaction_id: tx.id,
      old_status: tx.status,
      new_status: tx.status,
      event: dedupeEvent,
      reason: "Unhandled payout webhook status recorded",
      changed_by: "PAWAPAY_WEBHOOK",
    });
    return "ignored";
  }

  const oldStatus = tx.status;
  if (tx.status !== "COMPLETED") {
    const { error: transitionError } = await supabase
      .from("transactions")
      .update({ status: "COMPLETED" })
      .eq("id", tx.id)
      .in("status", ["SECURED", "PAYOUT_FAILED", "PAYOUT_DELAYED"]);

    if (transitionError) {
      await logWebhookError(
        "PAYOUT_COMPLETION_TRANSITION_FAILED",
        transitionError.message,
        {
          component: "pawapay-webhook",
          transaction_id: tx.id,
          status_before: tx.status,
        },
        tx.id,
      );
      return "ignored";
    }

    try {
      await incrementSuccessfulTransactions(tx.buyer_phone);
      await incrementSuccessfulTransactions(tx.seller_phone);
    } catch (error) {
      await logWebhookError(
        "PAYOUT_SUCCESS_COUNTER_UPDATE_FAILED",
        error instanceof Error ? error.message : "Unknown counter update error",
        { component: "pawapay-webhook", transaction_id: tx.id },
        tx.id,
      );
    }

    try {
      await sendPayoutCompletionNotifications(tx);
    } catch (error) {
      await logWebhookError(
        "PAYOUT_COMPLETION_NOTIFICATION_FAILED",
        error instanceof Error ? error.message : "Unknown notification error",
        { component: "pawapay-webhook", transaction_id: tx.id },
        tx.id,
      );
    }

    await supabase.from("transaction_status_log").insert({
      transaction_id: tx.id,
      old_status: oldStatus,
      new_status: "COMPLETED",
      event: "PAYOUT_SUCCEEDED",
      reason: "PawaPay payout webhook successful",
      changed_by: "PAWAPAY_WEBHOOK",
    });
  }

  await supabase.from("transaction_status_log").insert({
    transaction_id: tx.id,
    old_status: oldStatus,
    new_status: "COMPLETED",
    event: dedupeEvent,
    reason: "Payout webhook processed",
    changed_by: "PAWAPAY_WEBHOOK",
  });
  return "processed";
}

function isRefundSuccessStatus(status: string): boolean {
  return ["COMPLETED", "SUCCESS", "SUCCESSFUL", "SUCCEEDED"].includes(status);
}

async function sendRefundCompletionNotifications(
  transaction: RefundTransactionRow,
): Promise<void> {
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.buyer_phone,
    transactionId: transaction.id,
    messageText:
      "⏰ Délai expiré.\n\nVos fonds ont été remboursés (hors frais opérateur).",
  });
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.seller_phone,
    transactionId: transaction.id,
    messageText:
      "❌ Transaction annulée.\n\nUn remboursement a été effectué pour l'acheteur.",
  });
}

async function processRefundWebhookRecord(
  record: ParsedPawaPayWebhook,
): Promise<"processed" | "duplicate" | "ignored"> {
  if (!record.transactionId) {
    return "ignored";
  }

  const supabase = createServiceRoleClient();
  const eventStatus = normalizeStatus(record.status);
  const dedupeEvent =
    `PAWAPAY_REFUND_${record.externalId ?? "NO_ID"}_${eventStatus || "UNKNOWN"}`;

  const { data: existingLog } = await supabase
    .from("transaction_status_log")
    .select("id")
    .eq("transaction_id", record.transactionId)
    .eq("event", dedupeEvent)
    .limit(1)
    .maybeSingle();

  if (existingLog) {
    return "duplicate";
  }

  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select("id, status, buyer_phone, seller_phone, pawapay_refund_id")
    .eq("id", record.transactionId)
    .maybeSingle();

  if (txError || !transaction) {
    return "ignored";
  }

  const tx = transaction as RefundTransactionRow;
  if (record.externalId && !tx.pawapay_refund_id) {
    await supabase
      .from("transactions")
      .update({ pawapay_refund_id: record.externalId })
      .eq("id", tx.id);
  }

  if (!isRefundSuccessStatus(eventStatus)) {
    await supabase.from("transaction_status_log").insert({
      transaction_id: tx.id,
      old_status: tx.status,
      new_status: tx.status,
      event: dedupeEvent,
      reason: "Unhandled refund webhook status recorded",
      changed_by: "PAWAPAY_WEBHOOK",
    });
    return "ignored";
  }

  const oldStatus = tx.status;
  if (tx.status !== "CANCELLED") {
    await supabase
      .from("transactions")
      .update({ status: "CANCELLED" })
      .eq("id", tx.id)
      .in("status", ["SECURED", "PIN_FAILED_LOCKED", "PAYOUT_FAILED", "PAYOUT_DELAYED"]);

    await supabase.from("transaction_status_log").insert({
      transaction_id: tx.id,
      old_status: oldStatus,
      new_status: "CANCELLED",
      event: "REFUND_COMPLETED",
      reason: "PawaPay refund webhook successful",
      changed_by: "PAWAPAY_WEBHOOK",
    });

    try {
      await sendRefundCompletionNotifications(tx);
    } catch (error) {
      await logWebhookError(
        "REFUND_COMPLETION_NOTIFICATION_FAILED",
        error instanceof Error ? error.message : "Unknown notification error",
        { component: "pawapay-webhook", transaction_id: tx.id },
        tx.id,
      );
    }
  }

  await supabase.from("transaction_status_log").insert({
    transaction_id: tx.id,
    old_status: oldStatus,
    new_status: "CANCELLED",
    event: dedupeEvent,
    reason: "Refund webhook processed",
    changed_by: "PAWAPAY_WEBHOOK",
  });
  return "processed";
}

async function processWebhookRecords(
  records: ParsedPawaPayWebhook[],
): Promise<{
  processed: number;
  duplicates: number;
  ignored: number;
}> {
  let processed = 0;
  let duplicates = 0;
  let ignored = 0;

  for (const record of records) {
    if (record.eventType === "deposit") {
      const outcome = await processDepositWebhookRecord(record);
      if (outcome === "processed") {
        processed += 1;
      } else if (outcome === "duplicate") {
        duplicates += 1;
      } else {
        ignored += 1;
      }
      continue;
    }

    if (record.eventType === "payout") {
      const outcome = await processPayoutWebhookRecord(record);
      if (outcome === "processed") {
        processed += 1;
      } else if (outcome === "duplicate") {
        duplicates += 1;
      } else {
        ignored += 1;
      }
      continue;
    }

    if (record.eventType === "refund") {
      const outcome = await processRefundWebhookRecord(record);
      if (outcome === "processed") {
        processed += 1;
      } else if (outcome === "duplicate") {
        duplicates += 1;
      } else {
        ignored += 1;
      }
      continue;
    }

    ignored += 1;
  }

  return { processed, duplicates, ignored };
}

serve(async (request: Request): Promise<Response> => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const pawaPayApiSecret = Deno.env.get("PAWAPAY_API_SECRET");
    if (!pawaPayApiSecret) {
      return jsonResponse(
        { error: "Server configuration missing PAWAPAY_API_SECRET" },
        500,
      );
    }

    const rawSignatureHeader = request.headers.get("x-pawapay-signature") ??
      request.headers.get("x-signature") ??
      request.headers.get("signature");

    if (!rawSignatureHeader) {
      await logWebhookError(
        "PAWAPAY_SIGNATURE_VALIDATION_FAILED",
        "Missing signature header",
        { component: "pawapay-webhook" },
      );
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payloadBytes = new Uint8Array(await request.arrayBuffer());
    const isValidSignature = await isValidPawaPaySignature(
      payloadBytes,
      rawSignatureHeader,
      pawaPayApiSecret,
    );

    if (!isValidSignature) {
      await logWebhookError(
        "PAWAPAY_SIGNATURE_VALIDATION_FAILED",
        "Invalid webhook signature",
        {
          component: "pawapay-webhook",
          signature_header_prefix: rawSignatureHeader.slice(0, 32),
        },
      );
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payloadText = new TextDecoder().decode(payloadBytes);
    let payload: unknown;
    try {
      payload = JSON.parse(payloadText) as unknown;
    } catch {
      await logWebhookError(
        "PAWAPAY_WEBHOOK_PARSE_FAILED",
        "Invalid JSON payload",
        { component: "pawapay-webhook" },
      );
      return jsonResponse(
        { ok: false, accepted: false, error: "Invalid JSON payload" },
        500,
      );
    }

    const parsedRecords = parseWebhookRecords(payload);
    const processingResult = await processWebhookRecords(parsedRecords);

    return jsonResponse({
      ok: true,
      accepted: true,
      function: "pawapay-webhook",
      processed_records: processingResult.processed,
      duplicate_records: processingResult.duplicates,
      ignored_records: processingResult.ignored,
      parsed_records: parsedRecords.length,
    });
  } catch (error) {
    await logWebhookError(
      "PAWAPAY_WEBHOOK_UNHANDLED_ERROR",
      error instanceof Error ? error.message : "Unknown error",
      { component: "pawapay-webhook" },
    );
    return jsonResponse(
      {
        ok: false,
        function: "pawapay-webhook",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
