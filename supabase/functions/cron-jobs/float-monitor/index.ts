import { serve } from "@std/http/server";
import { assessPayoutFloat } from "../../_shared/floatMonitor.ts";
import { jsonResponse } from "../../_shared/http.ts";

serve(async (request: Request): Promise<Response> => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Force refresh from PawaPay API; helper persists 5-minute cache.
    const assessment = await assessPayoutFloat({ forceRefresh: true });

    return jsonResponse({
      ok: true,
      function: "cron-jobs/float-monitor",
      payout_balance_usd: assessment.payoutBalanceUsd,
      level: assessment.level,
      blocked_new_transactions: assessment.blocked,
      source: assessment.source,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        function: "cron-jobs/float-monitor",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
