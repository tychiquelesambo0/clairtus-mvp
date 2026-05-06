import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";

serve(async (_request: Request): Promise<Response> => {
  const pawaPayBaseUrl = Deno.env.get("PAWAPAY_BASE_URL") || "";
  const pawaPayApiKey = Deno.env.get("PAWAPAY_API_KEY") || "";
  const pawaPayApiToken = Deno.env.get("PAWAPAY_API_TOKEN") || "";
  const pawaPayCorrespondent = Deno.env.get("PAWAPAY_CORRESPONDENT") || "";
  const pawaPayApiSecret = Deno.env.get("PAWAPAY_API_SECRET") || "";
  
  return jsonResponse({
    PAWAPAY_BASE_URL: pawaPayBaseUrl,
    PAWAPAY_API_KEY_SET: pawaPayApiKey ? `Yes (${pawaPayApiKey.length} chars)` : "NO - MISSING!",
    PAWAPAY_API_TOKEN_SET: pawaPayApiToken ? `Yes (${pawaPayApiToken.length} chars)` : "NO - MISSING!",
    PAWAPAY_CORRESPONDENT: pawaPayCorrespondent || "NO - MISSING!",
    PAWAPAY_API_SECRET_SET: pawaPayApiSecret ? `Yes (${pawaPayApiSecret.length} chars)` : "NO - MISSING!",
    
    CRITICAL_ISSUES: {
      missing_api_key: !pawaPayApiKey && !pawaPayApiToken,
      missing_base_url: !pawaPayBaseUrl,
      missing_correspondent: !pawaPayCorrespondent,
    },
    
    RECOMMENDATION: !pawaPayApiKey && !pawaPayApiToken 
      ? "CRITICAL: Set either PAWAPAY_API_KEY or PAWAPAY_API_TOKEN!"
      : "Configuration looks OK",
  });
});
