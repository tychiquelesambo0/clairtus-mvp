import { createServiceRoleClient } from "./supabaseClient.ts";

function toMetaPhoneRecipient(phoneE164: string): string {
  return phoneE164.replace("+", "");
}

async function logWhatsAppError(
  transactionId: string | null,
  message: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("error_logs").insert({
      transaction_id: transactionId,
      error_type: "META_WHATSAPP_SEND_FAILED",
      error_message: message,
      error_details: details,
    });
  } catch {
    // Never throw from logger.
  }
}

export async function sendWhatsAppTextMessage(input: {
  recipientPhoneE164: string;
  messageText: string;
  transactionId?: string;
}): Promise<{ sent: boolean; status: number; rawBody: string }> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") ?? "v18.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID for text send.",
    );
  }

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toMetaPhoneRecipient(input.recipientPhoneE164),
    type: "text",
    text: {
      body: input.messageText,
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    await logWhatsAppError(
      input.transactionId ?? null,
      `WhatsApp text send failed with status ${response.status}`,
      {
        endpoint,
        recipient: input.recipientPhoneE164,
        response_status: response.status,
        response_body: rawBody,
      },
    );
  }

  return {
    sent: response.ok,
    status: response.status,
    rawBody,
  };
}
