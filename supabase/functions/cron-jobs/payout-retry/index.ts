import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../../_shared/http.ts";
import { initiatePayoutForTransaction } from "../../_shared/payoutFlow.ts";
import { createServiceRoleClient } from "../../_shared/supabaseClient.ts";
import { sendWhatsAppTextMessage } from "../../_shared/whatsappMessaging.ts";

interface DelayedPayoutRow {
  id: string;
  status: "PAYOUT_DELAYED";
  updated_at: string;
  seller_phone: string;
  buyer_phone: string;
  requires_human: boolean;
}

const ESCALATION_AFTER_MS = 24 * 60 * 60 * 1000;

async function logCronError(
  transactionId: string | null,
  message: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("error_logs").insert({
      transaction_id: transactionId,
      error_type: "PAYOUT_RETRY_CRON_ERROR",
      error_message: message,
      error_details: details,
    });
  } catch {
    // Never throw from logger.
  }
}

async function sendAdminAlert(
  transactionId: string,
  details: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("error_logs").insert({
    transaction_id: transactionId,
    error_type: "ADMIN_ALERT_PAYOUT_RETRY_TIMEOUT",
    error_message:
      "Payout retry exceeded 24h and was escalated to human support queue.",
    error_details: details,
  });
}

async function escalateToHumanQueue(transaction: DelayedPayoutRow): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update({ requires_human: true })
    .eq("id", transaction.id)
    .eq("status", "PAYOUT_DELAYED")
    .eq("requires_human", false)
    .select("id")
    .maybeSingle();

  if (updateError) {
    throw new Error(
      `Failed to set requires_human for ${transaction.id}: ${updateError.message}`,
    );
  }

  if (updated) {
    await supabase.from("transaction_status_log").insert({
      transaction_id: transaction.id,
      old_status: "PAYOUT_DELAYED",
      new_status: "PAYOUT_DELAYED",
      event: "PAYOUT_RETRY_TIMEOUT_ESCALATED",
      reason: "Payout delayed retries exceeded 24h threshold",
      changed_by: "CRON_PAYOUT_RETRY",
    });
  }

  await sendAdminAlert(transaction.id, {
    component: "cron-jobs/payout-retry",
    transaction_id: transaction.id,
    requires_human: true,
    escalation_threshold_hours: 24,
    already_marked: !updated,
  });

  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.seller_phone,
    transactionId: transaction.id,
    messageText:
      "🆘 Paiement retardé depuis plus de 24h.\n\nUn agent Clairtus prend le relais pour vous assister.",
  });
}

serve(async (request: Request): Promise<Response> => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const supabase = createServiceRoleClient();
    const nowMs = Date.now();

    const { data: delayedRows, error: delayedError } = await supabase
      .from("transactions")
      .select("id, status, updated_at, seller_phone, buyer_phone, requires_human")
      .eq("status", "PAYOUT_DELAYED");

    if (delayedError) {
      throw new Error(`Failed to query PAYOUT_DELAYED: ${delayedError.message}`);
    }

    let retried = 0;
    let acceptedForProcessing = 0;
    let stillFailing = 0;
    let escalated = 0;
    let skippedHuman = 0;
    let failures = 0;

    for (const row of (delayedRows ?? []) as DelayedPayoutRow[]) {
      try {
        const elapsedMs = nowMs - new Date(row.updated_at).getTime();
        const shouldEscalate = elapsedMs >= ESCALATION_AFTER_MS;

        if (row.requires_human) {
          skippedHuman += 1;
          continue;
        }

        if (shouldEscalate) {
          await escalateToHumanQueue(row);
          escalated += 1;
          continue;
        }

        const result = await initiatePayoutForTransaction(row.id);
        retried += 1;

        if (result.initiated === true) {
          acceptedForProcessing += 1;
        } else {
          stillFailing += 1;
        }
      } catch (error) {
        failures += 1;
        await logCronError(
          row.id,
          error instanceof Error ? error.message : "Unknown retry processing error",
          {
            component: "cron-jobs/payout-retry",
            transaction_id: row.id,
          },
        );
      }
    }

    return jsonResponse({
      ok: true,
      function: "cron-jobs/payout-retry",
      delayed_found: (delayedRows ?? []).length,
      retried,
      accepted_for_processing: acceptedForProcessing,
      still_failing: stillFailing,
      escalated,
      skipped_already_human: skippedHuman,
      failures,
    });
  } catch (error) {
    await logCronError(
      null,
      error instanceof Error ? error.message : "Unknown payout-retry cron error",
      { component: "cron-jobs/payout-retry", phase: "top-level" },
    );
    return jsonResponse(
      {
        ok: false,
        function: "cron-jobs/payout-retry",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
