export type TransactionButtonAction = "ACCEPTER" | "REFUSER" | "AIDE" | "ANNULER";
export type PayoutButtonAction = "RETRY_PAYOUT";

export interface ParsedTransactionButtonPayload {
  transactionId: string;
  action: TransactionButtonAction;
}

export interface InteractiveButtonDefinition {
  id: string;
  title: string;
}

export interface ParsedPayoutButtonPayload {
  transactionId: string;
  action: PayoutButtonAction;
}

interface SendInteractiveButtonsInput {
  recipientPhoneE164: string;
  bodyText: string;
  buttons: InteractiveButtonDefinition[];
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function toMetaPhoneRecipient(phoneE164: string): string {
  return phoneE164.replace("+", "");
}

export function buildTransactionButtonPayload(
  action: TransactionButtonAction,
  transactionId: string,
): string {
  return `TXN|${transactionId}|${action}`;
}

export function parseTransactionButtonPayload(
  payload: string | null,
): ParsedTransactionButtonPayload | null {
  if (!payload) {
    return null;
  }

  const match = /^TXN\|([0-9a-fA-F-]{36})\|(ACCEPTER|REFUSER|AIDE|ANNULER)$/.exec(payload.trim());
  if (!match) {
    return null;
  }

  const transactionId = match[1];
  if (!isValidUuid(transactionId)) {
    return null;
  }

  return {
    transactionId,
    action: match[2] as TransactionButtonAction,
  };
}

export function buildPayoutRetryPayload(transactionId: string): string {
  return `PAYOUT|${transactionId}|RETRY`;
}

export function parsePayoutButtonPayload(
  payload: string | null,
): ParsedPayoutButtonPayload | null {
  if (!payload) {
    return null;
  }

  const match = /^PAYOUT\|([0-9a-fA-F-]{36})\|RETRY$/.exec(payload.trim());
  if (!match) {
    return null;
  }

  const transactionId = match[1];
  if (!isValidUuid(transactionId)) {
    return null;
  }

  return {
    transactionId,
    action: "RETRY_PAYOUT",
  };
}

export function buildInitiatedTransactionPrompt(params: {
  transactionId: string;
  initiatorDisplayName: string;
  recipientRole: "BUYER" | "SELLER";
  sellerPhone: string;
  itemDescription: string;
  baseAmount: number;
  initiatorTrustScore: string;
}): string {
  const roleLine = params.recipientRole === "BUYER"
    ? "🧭 Votre rôle : Acheteur"
    : "🧭 Votre rôle : Vendeur";
  const feeLine = params.recipientRole === "BUYER"
    ? "💡 Frais : vous payez les frais Mobile Money opérateur."
    : "💡 Frais : Clairtus déduit 2,5% du montant total.";
  const transparencyLine = params.recipientRole === "BUYER"
    ? `🔎 Numéro vendeur déclaré : ${params.sellerPhone}`
    : `🔎 Numéro vendeur : ${params.sellerPhone}`;
  return [
    "🛡️ Clairtus | Paiement sécurisé",
    "",
    "Nouvelle demande de transaction",
    roleLine,
    `👤 Contrepartie : ${params.initiatorDisplayName}`,
    transparencyLine,
    `📦 Article : ${params.itemDescription}`,
    `💵 Montant : ${params.baseAmount.toFixed(2)} $`,
    feeLine,
    `📊 Fiabilité de la contrepartie : ${params.initiatorTrustScore}`,
    "",
    "Choisissez une action :",
    "• ACCEPTER",
    "• REFUSER",
    "• AIDE",
    "",
    "Vous pouvez annuler tant que le paiement n'est pas confirmé.",
  ].join("\n");
}

export function buildInitiatedTransactionButtons(
  transactionId: string,
): InteractiveButtonDefinition[] {
  return [
    {
      id: buildTransactionButtonPayload("ACCEPTER", transactionId),
      title: "ACCEPTER",
    },
    {
      id: buildTransactionButtonPayload("REFUSER", transactionId),
      title: "REFUSER",
    },
    {
      id: buildTransactionButtonPayload("AIDE", transactionId),
      title: "AIDE",
    },
  ];
}

export function buildPayoutRetryButtons(
  transactionId: string,
): InteractiveButtonDefinition[] {
  return [
    {
      id: buildPayoutRetryPayload(transactionId),
      title: "RÉESSAYER",
    },
    {
      id: buildTransactionButtonPayload("AIDE", transactionId),
      title: "AIDE",
    },
  ];
}

export function buildPrePaymentManagementButtons(
  transactionId: string,
): InteractiveButtonDefinition[] {
  return [
    {
      id: buildTransactionButtonPayload("ANNULER", transactionId),
      title: "ANNULER",
    },
    {
      id: buildTransactionButtonPayload("AIDE", transactionId),
      title: "AIDE",
    },
  ];
}

export async function sendInteractiveButtonsMessage(
  input: SendInteractiveButtonsInput,
): Promise<{ sent: boolean; responseStatus: number; responseBody: string }> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") ?? "v18.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID for interactive send.",
    );
  }

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toMetaPhoneRecipient(input.recipientPhoneE164),
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: input.bodyText,
      },
      action: {
        buttons: input.buttons.map((button) => ({
          type: "reply",
          reply: {
            id: button.id,
            title: button.title,
          },
        })),
      },
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

  const responseBody = await response.text();
  return {
    sent: response.ok,
    responseStatus: response.status,
    responseBody,
  };
}
