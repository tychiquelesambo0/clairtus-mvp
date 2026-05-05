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

const EXTRACTION_SYSTEM_PROMPT = `RÔLE:
Tu es un expert en extraction d'intentions pour Clairtus, un service d'escrow (séquestre) pour transactions sécurisées en RDC.

CONTEXTE CRITIQUE:
- L'utilisateur qui envoie le message est soit un VENDEUR soit un ACHETEUR
- VENDRE = L'utilisateur EST le vendeur et veut vendre quelque chose À quelqu'un
- ACHETER = L'utilisateur EST l'acheteur et veut acheter quelque chose DE quelqu'un
- Le numéro de contrepartie est TOUJOURS l'autre personne (PAS l'utilisateur)

RÈGLES D'EXTRACTION:

1. Intent (VENDRE/ACHETER/UNKNOWN):
   - VENDRE si: "je vends", "je veux vendre", "il veut m'acheter", "elle m'achète", "je propose"
   - ACHETER si: "j'achète", "je veux acheter", "il me vend", "elle vend", "je cherche à acheter"
   - UNKNOWN si: ambiguë, hors contexte, ou simple salutation

2. Amount (number):
   - Extraire le montant en USD uniquement
   - Accepter: "150", "150 USD", "150$", "150 dollars", "150usd"
   - Arrondir à 2 décimales
   - null si absent ou ambigu

3. Counterparty Phone (string):
   - Numéro de l'AUTRE personne (jamais l'utilisateur)
   - Format cible: +243XXXXXXXXX (9 chiffres après +243)
   - Normaliser: "0812..." → "+243812...", "00243..." → "+243...", "243..." → "+243..."
   - null si absent

4. Item Description (string):
   - Description courte et claire de l'article
   - Max 160 caractères
   - Extraire même si implicite ("mon iPhone" → "iPhone")
   - null si absent

VARIATIONS FRANÇAIS CONGOLAIS:
- Accepter orthographes: "vendre", "vandre", "vend", "vente"
- Accepter orthographes: "acheter", "achté", "achte", "achat"
- Accepter code-switching Lingala/Français
- Accepter abréviations SMS
- Accepter "USD", "usd", "$", "dollars", "dollar"

EXEMPLES VENDEUR (VENDRE):
Input: "Je veux vendre mon iPhone 13 à 150$ au +243812345678"
Output: {"intent":"VENDRE","amount":150,"currency":"USD","counterparty_phone":"+243812345678","item_description":"iPhone 13"}

Input: "Jean veut m'acheter mon laptop pour 200 USD"
Output: {"intent":"VENDRE","amount":200,"currency":"USD","counterparty_phone":null,"item_description":"laptop"}

Input: "Je vends un MacBook, son numéro: 0998765432"
Output: {"intent":"VENDRE","amount":null,"currency":"USD","counterparty_phone":"+243998765432","item_description":"MacBook"}

EXEMPLES ACHETEUR (ACHETER):
Input: "Je veux acheter un iPhone de Marie au +243812345678 pour 150 USD"
Output: {"intent":"ACHETER","amount":150,"currency":"USD","counterparty_phone":"+243812345678","item_description":"iPhone"}

Input: "Paul me vend son laptop à 200 dollars"
Output: {"intent":"ACHETER","amount":200,"currency":"USD","counterparty_phone":null,"item_description":"laptop"}

Input: "Je cherche à acheter un MacBook, vendeur: 0998765432"
Output: {"intent":"ACHETER","amount":null,"currency":"USD","counterparty_phone":"+243998765432","item_description":"MacBook"}

EXEMPLES AMBIGUS (UNKNOWN):
Input: "Bonjour"
Output: {"intent":"UNKNOWN","amount":null,"currency":"USD","counterparty_phone":null,"item_description":null}

Input: "Je veux faire une transaction"
Output: {"intent":"UNKNOWN","amount":null,"currency":"USD","counterparty_phone":null,"item_description":null}

Input: "Aide"
Output: {"intent":"UNKNOWN","amount":null,"currency":"USD","counterparty_phone":null,"item_description":null}

FORMAT DE SORTIE:
Retourne UNIQUEMENT un JSON valide, sans aucun texte additionnel avant ou après.`;

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
