import { normalizeDrPhoneToE164 } from "../phone.ts";

export type ExtractedIntent = "VENDRE" | "ACHETER" | "UNKNOWN";

export interface ExtractedTransactionIntent {
  intent: ExtractedIntent;
  amount: number | null;
  currency: "USD";
  counterparty_phone: string | null;
  item_description: string | null;
}

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

const EXTRACTION_SYSTEM_PROMPT =
  "Tu es un parseur JSON pour un bot fintech d'escrow en RDC. Analyse le message utilisateur et extrais l'intention de transaction. Retourne uniquement un JSON strictement valide qui respecte exactement cette interface: { intent: 'VENDRE' | 'ACHETER' | 'UNKNOWN', amount: number | null, currency: 'USD', counterparty_phone: string | null, item_description: string | null }. Si une valeur manque, retourne null. La devise doit toujours etre 'USD'. Le numero de contrepartie doit etre au format international si possible. N'ajoute aucun texte hors JSON.";

const FALLBACK_EXTRACTION: ExtractedTransactionIntent = {
  intent: "UNKNOWN",
  amount: null,
  currency: "USD",
  counterparty_phone: null,
  item_description: null,
};

function sanitizeParsedExtraction(raw: unknown): ExtractedTransactionIntent {
  if (!raw || typeof raw !== "object") {
    return FALLBACK_EXTRACTION;
  }

  const payload = raw as Record<string, unknown>;
  const rawIntent = payload.intent;
  const intent: ExtractedIntent = rawIntent === "VENDRE" || rawIntent === "ACHETER"
    ? rawIntent
    : "UNKNOWN";

  const rawAmount = payload.amount;
  const amount = typeof rawAmount === "number" && Number.isFinite(rawAmount) && rawAmount > 0
    ? Math.round(rawAmount * 100) / 100
    : null;

  const rawItem = payload.item_description;
  const itemDescription = typeof rawItem === "string" && rawItem.trim().length > 0
    ? rawItem.trim().slice(0, 160)
    : null;

  const rawPhone = payload.counterparty_phone;
  let counterpartyPhone: string | null = null;
  if (typeof rawPhone === "string" && rawPhone.trim().length > 0) {
    const normalizedPhone = normalizeDrPhoneToE164(rawPhone.trim());
    counterpartyPhone = normalizedPhone.ok ? normalizedPhone.value : null;
  }

  return {
    intent,
    amount,
    currency: "USD",
    counterparty_phone: counterpartyPhone,
    item_description: itemDescription,
  };
}

export async function extractTransactionIntent(
  userMessage: string,
): Promise<ExtractedTransactionIntent> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return FALLBACK_EXTRACTION;
  }

  const model = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-4o-mini";
  const timeoutMs = 5000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("openai_timeout"), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: EXTRACTION_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return FALLBACK_EXTRACTION;
    }

    const completion = await response.json() as OpenAiChatCompletionResponse;
    const responseContent = completion.choices?.[0]?.message?.content;
    if (!responseContent) {
      return FALLBACK_EXTRACTION;
    }

    const parsed = JSON.parse(responseContent) as unknown;
    return sanitizeParsedExtraction(parsed);
  } catch {
    return FALLBACK_EXTRACTION;
  } finally {
    clearTimeout(timeout);
  }
}
