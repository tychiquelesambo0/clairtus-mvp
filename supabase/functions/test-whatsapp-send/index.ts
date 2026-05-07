import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/http.ts";
import { sendWhatsAppTextMessage } from "../_shared/whatsappMessaging.ts";

serve(async (request: Request): Promise<Response> => {
  try {
    const { phone, message } = await request.json();
    const testPhone = phone || "+27603960790";
    const testMessage = message || "🤖 Test message from Clairtus bot. If you receive this, WhatsApp messaging is working!";
    
    const result = await sendWhatsAppTextMessage({
      recipientPhoneE164: testPhone,
      messageText: testMessage,
      transactionId: null,
    });
    
    return jsonResponse({
      test: "WhatsApp Send Test",
      phone: testPhone,
      message: testMessage,
      result: {
        sent: result.sent,
        status: result.status,
        message_id: result.messageId,
        error: result.error,
      },
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    }, 500);
  }
});
