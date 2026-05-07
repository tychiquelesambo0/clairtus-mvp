import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";

serve(async (_request: Request): Promise<Response> => {
  const supabase = createServiceRoleClient();
  
  // Get the latest transaction
  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  
  if (txError) {
    return jsonResponse({ error: txError.message }, 500);
  }
  
  // Get error logs for the latest transaction
  const latestTxId = transactions?.[0]?.id;
  const { data: errorLogs } = await supabase
    .from("error_logs")
    .select("*")
    .eq("transaction_id", latestTxId)
    .order("created_at", { ascending: false })
    .limit(10);
  
  // Get status logs
  const { data: statusLogs } = await supabase
    .from("transaction_status_log")
    .select("*")
    .eq("transaction_id", latestTxId)
    .order("created_at", { ascending: false })
    .limit(20);
  
  return jsonResponse({
    latest_transactions: transactions,
    error_logs: errorLogs || [],
    status_logs: statusLogs || [],
  });
});
