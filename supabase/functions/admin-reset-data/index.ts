import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";
import { jsonResponse } from "../_shared/http.ts";

serve(async (request: Request): Promise<Response> => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const adminKey = request.headers.get("x-admin-key");
    const validAdminKey = Deno.env.get("ADMIN_RESET_KEY") || "clairtus_admin_2026";
    
    if (adminKey !== validAdminKey) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createServiceRoleClient();

    console.log("Starting production data reset...");

    // Step 1: Delete transaction status logs
    const { error: logError } = await supabase
      .from("transaction_status_log")
      .delete()
      .neq("transaction_id", "00000000-0000-0000-0000-000000000000");
    
    if (logError) {
      throw new Error(`Failed to delete transaction logs: ${logError.message}`);
    }
    console.log("✅ Deleted transaction_status_log");

    // Step 2: Delete all transactions
    const { error: txError } = await supabase
      .from("transactions")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    
    if (txError) {
      throw new Error(`Failed to delete transactions: ${txError.message}`);
    }
    console.log("✅ Deleted transactions");

    // Step 3: Delete users EXCEPT test users
    const { error: userError } = await supabase
      .from("users")
      .delete()
      .not("phone_number", "in", "(+27603960790,+27695446706)");
    
    if (userError) {
      throw new Error(`Failed to delete users: ${userError.message}`);
    }
    console.log("✅ Deleted users (kept test users)");

    // Step 4: Delete error logs
    const { error: errorLogError } = await supabase
      .from("error_logs")
      .delete()
      .neq("id", 0);
    
    if (errorLogError) {
      throw new Error(`Failed to delete error logs: ${errorLogError.message}`);
    }
    console.log("✅ Deleted error_logs");

    // Step 5: Delete messages log
    const { error: messagesError } = await supabase
      .from("messages_log")
      .delete()
      .neq("id", 0);
    
    if (messagesError) {
      console.warn("⚠️ Failed to delete messages_log:", messagesError.message);
    } else {
      console.log("✅ Deleted messages_log");
    }

    // Step 6: Delete guided transaction drafts (if table exists)
    const { error: draftError } = await supabase
      .from("guided_transaction_drafts")
      .delete()
      .neq("phone_number", "");
    
    if (draftError) {
      console.warn("⚠️ Failed to delete drafts:", draftError.message);
    } else {
      console.log("✅ Deleted guided_transaction_drafts");
    }

    // Step 7: Delete identity drafts (if table exists)
    const { error: identityError } = await supabase
      .from("identity_drafts")
      .delete()
      .neq("phone_number", "");
    
    if (identityError) {
      console.warn("⚠️ Failed to delete identity_drafts:", identityError.message);
    } else {
      console.log("✅ Deleted identity_drafts");
    }

    // Verification: Count remaining records
    const { count: userCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true });

    const { count: txCount } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true });

    const { data: remainingUsers } = await supabase
      .from("users")
      .select("phone_number, display_name, created_at")
      .order("created_at", { ascending: false });

    console.log("Production data reset complete!");

    return jsonResponse({
      ok: true,
      message: "Production data reset successful",
      deleted: {
        transactions: "all",
        transaction_logs: "all",
        users: "all except test users",
        error_logs: "all",
        delivery_logs: "all",
        drafts: "all",
      },
      remaining: {
        users: userCount,
        transactions: txCount,
        user_list: remainingUsers,
      },
    });
  } catch (error) {
    console.error("Reset failed:", error);
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
