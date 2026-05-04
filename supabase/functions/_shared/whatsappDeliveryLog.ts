import { createServiceRoleClient } from "./supabaseClient.ts";

type MessageDeliveryStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";

function normalizeDeliveryStatus(input: string): MessageDeliveryStatus {
  const normalized = input.trim().toUpperCase();
  if (normalized === "DELIVERED") {
    return "DELIVERED";
  }
  if (normalized === "READ") {
    return "READ";
  }
  if (normalized === "FAILED") {
    return "FAILED";
  }
  if (normalized === "SENT") {
    return "SENT";
  }
  return "PENDING";
}

export function extractWhatsAppMessageId(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as {
      messages?: Array<{ id?: string }>;
    };
    const id = parsed.messages?.[0]?.id;
    return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
  } catch {
    return null;
  }
}

export async function logOutgoingWhatsAppMessage(input: {
  transactionId?: string | null;
  recipientPhoneE164: string;
  messageText: string;
  sentBy: string;
  whatsappMessageId: string | null;
  sent: boolean;
}): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("messages_log").insert({
      transaction_id: input.transactionId ?? null,
      recipient_phone: input.recipientPhoneE164,
      message_text: input.messageText,
      sent_by: input.sentBy,
      whatsapp_message_id: input.whatsappMessageId,
      delivery_status: input.sent ? "SENT" : "FAILED",
    });
  } catch {
    // Never block send flows on observability failures.
  }
}

export async function updateWhatsAppDeliveryStatus(input: {
  whatsappMessageId: string;
  status: string;
  statusPayload: Record<string, unknown>;
}): Promise<void> {
  const deliveryStatus = normalizeDeliveryStatus(input.status);
  try {
    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from("messages_log")
      .select("id, transaction_id, recipient_phone, message_text")
      .eq("whatsapp_message_id", input.whatsappMessageId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("messages_log")
        .update({ delivery_status: deliveryStatus })
        .eq("whatsapp_message_id", input.whatsappMessageId);

      if (deliveryStatus === "FAILED") {
        await supabase.from("error_logs").insert({
          transaction_id: (existing as { transaction_id?: string | null }).transaction_id ?? null,
          error_type: "WHATSAPP_DELIVERY_FAILED",
          error_message: "WhatsApp reported failed delivery status.",
          error_details: {
            whatsapp_message_id: input.whatsappMessageId,
            recipient_phone: (existing as { recipient_phone?: string | null }).recipient_phone ?? null,
            message_text: (existing as { message_text?: string | null }).message_text ?? null,
            payload: input.statusPayload,
          },
        });
      }
      return;
    }

    // Keep an audit signal when we receive a delivery status
    // but have no outbound log row yet.
    await supabase.from("error_logs").insert({
      error_type: "WHATSAPP_DELIVERY_STATUS_UNMATCHED",
      error_message: "Delivery status received without matching outbound message log row.",
      error_details: {
        whatsapp_message_id: input.whatsappMessageId,
        delivery_status: deliveryStatus,
        payload: input.statusPayload,
      },
    });
  } catch {
    // Never block webhook acknowledgement on status logging failures.
  }
}
