import { serve } from "@std/http/server";
import { jsonResponse } from "../../_shared/http.ts";
import { createServiceRoleClient } from "../../_shared/supabaseClient.ts";
import { sendWhatsAppTextMessage } from "../../_shared/whatsappMessaging.ts";

interface PendingFundingRow {
  id: string;
  status: "PENDING_FUNDING";
  buyer_phone: string;
  seller_phone: string;
}

interface PendingFundingStatusLogRow {
  transaction_id: string;
  changed_at: string;
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
      error_type: "DEPOSIT_TIMEOUT_CRON_ERROR",
      error_message: message,
      error_details: details,
    });
  } catch {
    // swallow
  }
}

async function processTimedOutDeposit(transaction: PendingFundingRow): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update({ status: "CANCELLED" })
    .eq("id", transaction.id)
    .eq("status", "PENDING_FUNDING")
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    throw new Error(
      `Failed to cancel timed-out deposit ${transaction.id}: ${updateError?.message ?? "not updated"}`,
    );
  }

  await supabase.from("transaction_status_log").insert({
    transaction_id: transaction.id,
    old_status: "PENDING_FUNDING",
    new_status: "CANCELLED",
    event: "DEPOSIT_TIMEOUT",
    reason: "PENDING_FUNDING exceeded 30 minutes without successful deposit",
    changed_by: "CRON_DEPOSIT_TIMEOUT",
  });

  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.buyer_phone,
    transactionId: transaction.id,
    messageText:
      "⏱️ Délai dépassé (30 minutes).\n\nLe paiement n'a pas été confirmé, la transaction est annulée.",
  });
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.seller_phone,
    transactionId: transaction.id,
    messageText:
      "⏱️ Délai dépassé (30 minutes).\n\nLe paiement de l'acheteur n'a pas été confirmé à temps.\nLa transaction est annulée.",
  });
}

serve(async (request: Request): Promise<Response> => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const supabase = createServiceRoleClient();
    const timeoutIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: pendingStatusLogs, error: logsError } = await supabase
      .from("transaction_status_log")
      .select("transaction_id, changed_at")
      .eq("new_status", "PENDING_FUNDING")
      .lte("changed_at", timeoutIso)
      .order("changed_at", { ascending: false });

    if (logsError) {
      throw new Error(`Failed to query PENDING_FUNDING status logs: ${logsError.message}`);
    }

    const timedOutIds = Array.from(
      new Set(
        ((pendingStatusLogs ?? []) as PendingFundingStatusLogRow[]).map((row) =>
          row.transaction_id
        ),
      ),
    );

    if (timedOutIds.length === 0) {
      return jsonResponse({
        ok: true,
        function: "cron-jobs/deposit-timeout",
        timed_out_found: 0,
        timed_out_processed: 0,
        failures: 0,
      });
    }

    const { data: timedOutRows, error } = await supabase
      .from("transactions")
      .select("id, status, buyer_phone, seller_phone")
      .in("id", timedOutIds)
      .eq("status", "PENDING_FUNDING");

    if (error) {
      throw new Error(`Failed to query deposit timeouts: ${error.message}`);
    }

    let processed = 0;
    let failures = 0;
    for (const row of (timedOutRows ?? []) as PendingFundingRow[]) {
      try {
        await processTimedOutDeposit(row);
        processed += 1;
      } catch (processError) {
        failures += 1;
        await logCronError(
          row.id,
          processError instanceof Error ? processError.message : "Unknown timeout error",
          { component: "cron-jobs/deposit-timeout" },
        );
      }
    }

    return jsonResponse({
      ok: true,
      function: "cron-jobs/deposit-timeout",
      timed_out_found: (timedOutRows ?? []).length,
      timed_out_processed: processed,
      failures,
    });
  } catch (error) {
    await logCronError(
      null,
      error instanceof Error ? error.message : "Unknown cron error",
      { component: "cron-jobs/deposit-timeout", phase: "top-level" },
    );
    return jsonResponse(
      {
        ok: false,
        function: "cron-jobs/deposit-timeout",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
