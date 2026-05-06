import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";

serve(async (_request: Request): Promise<Response> => {
  const apiKey = Deno.env.get("PAWAPAY_API_KEY") || "";
  const baseUrl = Deno.env.get("PAWAPAY_BASE_URL") || "https://api.pawapay.io";
  
  try {
    // Try a simple GET request to test authentication
    const response = await fetch(`${baseUrl}/v1/active-conf`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    
    const responseText = await response.text();
    let responseData = null;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }
    
    return jsonResponse({
      test: "PawaPay Authentication Test",
      base_url: baseUrl,
      api_key_length: apiKey.length,
      api_key_preview: `${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 20)}`,
      response: {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
        data: responseData,
      },
      diagnosis: response.status === 401 
        ? "API key is invalid or for wrong environment (sandbox vs live)"
        : response.ok
        ? "API key is VALID!"
        : `Unexpected status: ${response.status}`,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    }, 500);
  }
});
