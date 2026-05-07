import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";

serve(async (_request: Request): Promise<Response> => {
  const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
  const metaPhoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID") || "";
  const templateName = Deno.env.get("WHATSAPP_TRANSACTION_ALERT_TEMPLATE_NAME") || "";
  const templateLang = Deno.env.get("WHATSAPP_TRANSACTION_ALERT_TEMPLATE_LANG") || "";
  
  return jsonResponse({
    META_ACCESS_TOKEN_SET: metaAccessToken ? `Yes (${metaAccessToken.length} chars)` : "NO - MISSING!",
    META_PHONE_NUMBER_ID: metaPhoneNumberId || "NO - MISSING!",
    WHATSAPP_TRANSACTION_ALERT_TEMPLATE_NAME: templateName || "NO - MISSING!",
    WHATSAPP_TRANSACTION_ALERT_TEMPLATE_LANG: templateLang || "NO - MISSING!",
    
    CRITICAL_ISSUES: {
      missing_access_token: !metaAccessToken,
      missing_phone_number_id: !metaPhoneNumberId,
      missing_template_name: !templateName,
    },
    
    WARNING: !templateName 
      ? "Template name is missing - counterparties won't receive initial notifications!"
      : "Configuration looks OK",
  });
});
