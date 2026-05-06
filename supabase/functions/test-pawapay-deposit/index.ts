import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";
import { callPawaPay } from "../_shared/pawapayClient.ts";

serve(async (request: Request): Promise<Response> => {
  try {
    const { phone } = await request.json();
    const testPhone = phone || "+243976492939";
    
    // Detect operator
    let correspondent = "AIRTEL_OAPI_COD";
    if (testPhone.startsWith("+24384") || testPhone.startsWith("+24385") || testPhone.startsWith("+24389")) {
      correspondent = "ORANGE_OAPI_COD";
    } else if (testPhone.startsWith("+24381") || testPhone.startsWith("+24382") || testPhone.startsWith("+24383")) {
      correspondent = "VODACOM_MPESA_COD";
    }
    
    const testDepositId = crypto.randomUUID();
    const requestBody = {
      depositId: testDepositId,
      amount: "1.00",
      currency: "USD",
      correspondent,
      payer: {
        type: "MSISDN",
        address: {
          value: testPhone,
        },
      },
      customerTimestamp: new Date().toISOString(),
      statementDescription: "Clairtus test deposit",
    };
    
    const result = await callPawaPay({
      method: "POST",
      path: "/v1/deposits",
      transactionId: testDepositId,
      body: requestBody,
    });
    
    return jsonResponse({
      test_phone: testPhone,
      correspondent,
      pawapay_request: requestBody,
      pawapay_response: {
        ok: result.ok,
        status: result.status,
        data: result.data,
        rawBody: result.rawBody,
        duplicateDetected: result.duplicateDetected,
        attemptCount: result.attemptCount,
      },
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    }, 500);
  }
});
