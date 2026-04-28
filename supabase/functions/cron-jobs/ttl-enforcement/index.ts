import { serve } from "@std/http/server";
import { jsonResponse } from "../../_shared/http.ts";
import { initiateRefundForTransaction } from "../../_shared/refundFlow.ts";
import { createServiceRoleClient } from "../../_shared/supabaseClient.ts";
import { sendWhatsAppTextMessage } from "../../_shared/whatsappMessaging.ts";

interface ExpiredTransactionRow {
  id: string;
  status: "INITIATED" | "SECURED";
  seller_phone: string;
  buyer_phone: string;
  initiator_phone: string;
  expires_at: string;
}

async function logCronError(
  transactionId: string | null,
  message: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("error_logs").insert({
      transaction_id: transactionId,
      error_type: "TTL_ENFORCEMENT_CRON_ERROR",
      error_message: message,
      error_details: details,
    });
  } catch {
    // Do not throw from logger
  }
}

async function incrementCancelledTransactions(phoneNumber: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: user, error } = await supabase
    .from("users")
    .select("cancelled_transactions")
    .eq("phone_number", phoneNumber)
    .single();

  if (error || !user) {
    throw new Error(`User not found for cancelled increment: ${phoneNumber}`);
  }

  const current = (user as { cancelled_transactions: number }).cancelled_transactions;
  const { error: updateError } = await supabase
    .from("users")
    .update({ cancelled_transactions: current + 1 })
    .eq("phone_number", phoneNumber);

  if (updateError) {
    throw new Error(
      `Failed to increment cancelled_transactions for ${phoneNumber}: ${updateError.message}`,
    );
  }
}

async function processExpiredInitiatedTransaction(
  transaction: ExpiredTransactionRow,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update({ status: "CANCELLED" })
    .eq("id", transaction.id)
    .eq("status", "INITIATED")
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    throw new Error(
      `Failed to cancel expired INITIATED transaction ${transaction.id}: ${updateError?.message ?? "not updated"}`,
    );
  }

  await supabase.from("transaction_status_log").insert({
    transaction_id: transaction.id,
    old_status: "INITIATED",
    new_status: "CANCELLED",
    event: "TTL_EXPIRED",
    reason: "INITIATED timeout expired (24h)",
    changed_by: "CRON_TTL_ENFORCEMENT",
  });

  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.initiator_phone,
    transactionId: transaction.id,
    messageText:
      "⏰ Délai expiré.\n\nLa transaction est annulée faute d'acceptation à temps.",
  });
}

async function processExpiredSecuredTransaction(
  transaction: ExpiredTransactionRow,
): Promise<void> {
  const supabase = createServiceRoleClient();

  // Requirement 10.3/10.4: trigger refund for base amount only using transaction UUID idempotency.
  const refundResult = await initiateRefundForTransaction({
    transactionId: transaction.id,
    reason: "TTL_EXPIRED",
  });

  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update({ status: "CANCELLED" })
    .eq("id", transaction.id)
    .eq("status", "SECURED")
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    throw new Error(
      `Failed to cancel expired SECURED transaction ${transaction.id}: ${updateError?.message ?? "not updated"}`,
    );
  }

  await supabase.from("transaction_status_log").insert({
    transaction_id: transaction.id,
    old_status: "SECURED",
    new_status: "CANCELLED",
    event: "TTL_EXPIRED",
    reason: "SECURED timeout expired (72h) with refund initiation",
    changed_by: "CRON_TTL_ENFORCEMENT",
  });

  // Requirement 10.6: vendor is at fault for TTL-expired SECURED transactions.
  await incrementCancelledTransactions(transaction.seller_phone);

  // Requirements 10.7/10.8 notifications.
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.buyer_phone,
    transactionId: transaction.id,
    messageText:
      "⏰ Délai expiré.\n\nLe vendeur n'a pas livré dans les 72 heures.\nVos fonds ont été remboursés (hors frais opérateur).",
  });

  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.seller_phone,
    transactionId: transaction.id,
    messageText:
      "❌ Transaction annulée.\n\nVous n'avez pas livré dans les 72 heures.\nCela impacte votre score de confiance.",
  });

  await supabase.from("transaction_status_log").insert({
    transaction_id: transaction.id,
    old_status: "CANCELLED",
    new_status: "CANCELLED",
    event: "REFUND_INITIATED_TTL_EXPIRED",
    reason: `Refund initiated from TTL cron: ${JSON.stringify(refundResult)}`,
    changed_by: "CRON_TTL_ENFORCEMENT",
  });
}

serve(async (request: Request): Promise<Response> => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const supabase = createServiceRoleClient();
    const nowIso = new Date().toISOString();

    const { data: expiredInitiated, error: initiatedError } = await supabase
      .from("transactions")
      .select("id, status, seller_phone, buyer_phone, initiator_phone, expires_at")
      .eq("status", "INITIATED")
      .lte("expires_at", nowIso);

    if (initiatedError) {
      throw new Error(`Failed to query expired INITIATED transactions: ${initiatedError.message}`);
    }

    const { data: expiredSecured, error: securedError } = await supabase
      .from("transactions")
      .select("id, status, seller_phone, buyer_phone, initiator_phone, expires_at")
      .eq("status", "SECURED")
      .lte("expires_at", nowIso);

    if (securedError) {
      throw new Error(`Failed to query expired SECURED transactions: ${securedError.message}`);
    }

    let initiatedProcessed = 0;
    let securedProcessed = 0;
    let failures = 0;

    for (const row of (expiredInitiated ?? []) as ExpiredTransactionRow[]) {
      try {
        await processExpiredInitiatedTransaction(row);
        initiatedProcessed += 1;
      } catch (error) {
        failures += 1;
        await logCronError(
          row.id,
          error instanceof Error ? error.message : "Unknown INITIATED processing error",
          { component: "ttl-enforcement", phase: "INITIATED" },
        );
      }
    }

    for (const row of (expiredSecured ?? []) as ExpiredTransactionRow[]) {
      try {
        await processExpiredSecuredTransaction(row);
        securedProcessed += 1;
      } catch (error) {
        failures += 1;
        await logCronError(
          row.id,
          error instanceof Error ? error.message : "Unknown SECURED processing error",
          { component: "ttl-enforcement", phase: "SECURED" },
        );
      }
    }

    return jsonResponse({
      ok: true,
      function: "cron-jobs/ttl-enforcement",
      expired_initiated_found: (expiredInitiated ?? []).length,
      expired_secured_found: (expiredSecured ?? []).length,
      expired_initiated_processed: initiatedProcessed,
      expired_secured_processed: securedProcessed,
      failures,
    });
  } catch (error) {
    await logCronError(
      null,
      error instanceof Error ? error.message : "Unknown TTL cron error",
      { component: "ttl-enforcement", phase: "top-level" },
    );
    return jsonResponse(
      {
        ok: false,
        function: "cron-jobs/ttl-enforcement",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
