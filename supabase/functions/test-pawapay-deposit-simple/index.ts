import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";

serve(async (request: Request): Promise<Response> => {
  const { phone } = await request.json();
  const testPhone = phone || "+243976492939";
  
  const apiKey = Deno.env.get("PAWAPAY_API_KEY") || "";
  const baseUrl = Deno.env.get("PAWAPAY_BASE_URL") || "https://api.pawapay.io";
  
  const depositId = crypto.randomUUID();
  const requestBody = {
    depositId: depositId,
    amount: "1.00",
    currency: "USD",
    correspondent: "AIRTEL_COD",
    payer: {
      type: "MSISDN",
      address: {
        value: testPhone.replace(/^\+/, ""),
      },
    },
    customerTimestamp: new Date().toISOString(),
    statementDescription: "Clairtus test",
  };
  
  try {
    const response = await fetch(`${baseUrl}/v1/deposits`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    
    const responseText = await response.text();
    let responseData = null;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }
    
    return jsonResponse({
      test: "Direct PawaPay Deposit (NO Idempotency-Key)",
      request: requestBody,
      response: {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData,
      },
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});
