function allowNonDrcTestNumbers(): boolean {
  return Deno.env.get("ALLOW_NON_DRC_TEST_NUMBERS") === "true";
}

function formatErrorMessage(): string {
  if (allowNonDrcTestNumbers()) {
    return "Numéro invalide.\n\nUtilisez l'un des formats suivants :\n• 0XXXXXXXXX\n• 243XXXXXXXXX\n• +243XXXXXXXXX\n• 27XXXXXXXXX\n• +27XXXXXXXXX";
  }
  return "Numéro invalide.\n\nUtilisez l'un des formats suivants :\n• 0XXXXXXXXX\n• 243XXXXXXXXX\n• +243XXXXXXXXX";
}

export const PHONE_FORMAT_ERROR_MESSAGE = formatErrorMessage();

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
