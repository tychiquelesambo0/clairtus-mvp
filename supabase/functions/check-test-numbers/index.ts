import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";
import { isTestNumber } from "../_shared/phone.ts";

serve(async (request: Request): Promise<Response> => {
  try {
    const body = await request.json().catch(() => ({}));
    const phone = body.phone || "+243976492939";
    
    const whitelist = Deno.env.get("TEST_NUMBER_WHITELIST") || "";
    const autoMarkSecured = Deno.env.get("AUTO_MARK_PAYMENT_SECURED") || "false";
    const appEnv = Deno.env.get("APP_ENV") || "development";
    const isTest = isTestNumber(phone);
    
    return jsonResponse({
      phone,
      is_test_number: isTest,
      whitelist_env: whitelist,
      whitelist_array: whitelist.split(",").map(n => n.trim()),
      matches: whitelist.includes(phone),
      AUTO_MARK_PAYMENT_SECURED: autoMarkSecured,
      APP_ENV: appEnv,
      CRITICAL_BUG: autoMarkSecured === "true" ? "YES - THIS IS THE PROBLEM!" : "No",
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});
