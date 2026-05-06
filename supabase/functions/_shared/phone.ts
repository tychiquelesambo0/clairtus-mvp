function allowNonDrcTestNumbers(): boolean {
  return Deno.env.get("ALLOW_NON_DRC_TEST_NUMBERS") === "true";
}

function getTestNumberWhitelist(): string[] {
  const whitelist = Deno.env.get("TEST_NUMBER_WHITELIST") || "";
  return whitelist.split(",").map(n => n.trim()).filter(n => n.length > 0);
}

function formatErrorMessage(): string {
  return "⚠️ Numéro invalide.\n\nLe numéro doit inclure l'indicatif du pays sans espaces.\nExemple : +243810000000";
}

export const PHONE_FORMAT_ERROR_MESSAGE = formatErrorMessage();

export type DrcOperator = "AIRTEL_OAPI_COD" | "ORANGE_OAPI_COD" | "VODACOM_MPESA_COD";

const DRC_OPERATOR_PREFIXES: Record<DrcOperator, string[]> = {
  "AIRTEL_OAPI_COD": ["24397", "24398", "24399"],
  "ORANGE_OAPI_COD": ["24384", "24385", "24389"],
  "VODACOM_MPESA_COD": ["24381", "24382", "24383"],
};

export function detectDrcOperator(phoneE164: string): DrcOperator | null {
  if (!phoneE164.startsWith("+243")) {
    return null;
  }
  
  for (const [operator, prefixes] of Object.entries(DRC_OPERATOR_PREFIXES)) {
    for (const prefix of prefixes) {
      if (phoneE164.startsWith(`+${prefix}`)) {
        return operator as DrcOperator;
      }
    }
  }
  
  return "AIRTEL_OAPI_COD";
}

export function isTestNumber(phoneE164: string): boolean {
  const whitelist = getTestNumberWhitelist();
  return whitelist.includes(phoneE164);
}

export type PhoneNormalizationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function normalizeDrPhoneToE164(rawPhone: string): PhoneNormalizationResult {
  const trimmed = rawPhone.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  const allowNonDrc = allowNonDrcTestNumbers();

  if (!digitsOnly) {
    return { ok: false, error: formatErrorMessage() };
  }

  // E.164 already present: +243XXXXXXXXX
  if (trimmed.startsWith("+243") && digitsOnly.length === 12) {
    return { ok: true, value: `+${digitsOnly}` };
  }

  // Sandbox override: E.164 +27XXXXXXXXX
  if (allowNonDrc && trimmed.startsWith("+27") && digitsOnly.length === 11) {
    return { ok: true, value: `+${digitsOnly}` };
  }

  // National-with-country format: 243XXXXXXXXX
  if (digitsOnly.startsWith("243") && digitsOnly.length === 12) {
    return { ok: true, value: `+${digitsOnly}` };
  }

  // Sandbox override: national-with-country format 27XXXXXXXXX
  if (allowNonDrc && digitsOnly.startsWith("27") && digitsOnly.length === 11) {
    return { ok: true, value: `+${digitsOnly}` };
  }

  // Local format: 0XXXXXXXXX
  if (digitsOnly.startsWith("0") && digitsOnly.length === 10) {
    return { ok: true, value: `+243${digitsOnly.slice(1)}` };
  }

  return { ok: false, error: formatErrorMessage() };
}

export function normalizeDrPhoneToE164OrThrow(rawPhone: string): string {
  const result = normalizeDrPhoneToE164(rawPhone);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}
