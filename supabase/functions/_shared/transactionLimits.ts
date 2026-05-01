export const USD_MIN_BASE_AMOUNT = 1;
export const USD_DAILY_MOBILE_MONEY_CAP = 2500;
export const DEFAULT_MNO_FEE_RATE = 0.015;
const DEFAULT_CORRESPONDENT = "MTN_MOMO_COD";

interface CorrespondentLimitProfile {
  total_debit_cap_usd?: number;
  payout_cap_usd?: number;
  mno_fee_rate?: number;
}

export interface EffectiveDepositLimits {
  correspondent: string;
  bccTotalDebitCapUsd: number;
  effectiveTotalDebitCapUsd: number;
  mnoFeeRate: number;
}

export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function floorToCents(value: number): number {
  return Math.floor(value * 100) / 100;
}

function parsePositiveNumber(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getBccTotalDebitCapUsd(): number {
  return parsePositiveNumber(Deno.env.get("BCC_TOTAL_DEBIT_CAP_USD")) ?? USD_DAILY_MOBILE_MONEY_CAP;
}

function getDefaultPayoutCapUsd(): number {
  return parsePositiveNumber(Deno.env.get("DEFAULT_PAYOUT_CAP_USD")) ?? USD_DAILY_MOBILE_MONEY_CAP;
}

function loadCorrespondentLimitsMap(): Record<string, CorrespondentLimitProfile> {
  const raw = Deno.env.get("PAWAPAY_CORRESPONDENT_LIMITS_JSON");
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, CorrespondentLimitProfile>;
  } catch {
    return {};
  }
}

function getCorrespondentProfile(correspondent: string): CorrespondentLimitProfile | null {
  const all = loadCorrespondentLimitsMap();
  return all[correspondent] ?? null;
}

function resolveCorrespondentByPurpose(purpose: "deposit" | "payout"): string {
  if (purpose === "deposit") {
    return Deno.env.get("PAWAPAY_DEPOSIT_CORRESPONDENT") ??
      Deno.env.get("PAWAPAY_CORRESPONDENT") ??
      DEFAULT_CORRESPONDENT;
  }
  return Deno.env.get("PAWAPAY_PAYOUT_CORRESPONDENT") ??
    Deno.env.get("PAWAPAY_CORRESPONDENT") ??
    DEFAULT_CORRESPONDENT;
}

export function resolveDepositCorrespondent(): string {
  return resolveCorrespondentByPurpose("deposit");
}

export function resolvePayoutCorrespondent(): string {
  return resolveCorrespondentByPurpose("payout");
}

export function getEffectiveDepositLimits(correspondent: string = resolveDepositCorrespondent()): EffectiveDepositLimits {
  const profile = getCorrespondentProfile(correspondent);
  const bccCap = getBccTotalDebitCapUsd();
  const mnoCap = profile?.total_debit_cap_usd;
  const effectiveTotalDebitCapUsd = Number.isFinite(mnoCap ?? NaN)
    ? Math.min(bccCap, mnoCap as number)
    : bccCap;
  const mnoFeeRate = Number.isFinite(profile?.mno_fee_rate ?? NaN)
    ? (profile?.mno_fee_rate as number)
    : DEFAULT_MNO_FEE_RATE;

  return {
    correspondent,
    bccTotalDebitCapUsd: bccCap,
    effectiveTotalDebitCapUsd: roundToCents(effectiveTotalDebitCapUsd),
    mnoFeeRate,
  };
}

export function getEffectivePayoutCapUsd(correspondent: string = resolvePayoutCorrespondent()): number {
  const profile = getCorrespondentProfile(correspondent);
  const defaultCap = getDefaultPayoutCapUsd();
  const profileCap = profile?.payout_cap_usd;
  if (Number.isFinite(profileCap ?? NaN)) {
    return roundToCents(Math.min(defaultCap, profileCap as number));
  }
  return roundToCents(defaultCap);
}

export function computeMnoFeeFromBaseAmount(
  baseAmount: number,
  mnoFeeRate: number = DEFAULT_MNO_FEE_RATE,
): number {
  return roundToCents(baseAmount * mnoFeeRate);
}

export function computeBuyerDebitAmount(baseAmount: number, mnoFee: number): number {
  return roundToCents(baseAmount + mnoFee);
}

export function getMaxBaseAmountWithinDailyCap(
  mnoFeeRate: number = DEFAULT_MNO_FEE_RATE,
  totalDebitCapUsd: number = USD_DAILY_MOBILE_MONEY_CAP,
): number {
  return floorToCents(totalDebitCapUsd / (1 + mnoFeeRate));
}

export function buildAmountRangeErrorMessage(input?: {
  totalDebitCapUsd?: number;
  mnoFeeRate?: number;
}): string {
  const totalDebitCapUsd = input?.totalDebitCapUsd ?? getBccTotalDebitCapUsd();
  const mnoFeeRate = input?.mnoFeeRate ?? DEFAULT_MNO_FEE_RATE;
  const maxBaseAmount = getMaxBaseAmountWithinDailyCap(mnoFeeRate, totalDebitCapUsd);
  return `Montant invalide.\n\nLe montant doit être compris entre ${USD_MIN_BASE_AMOUNT} et ${maxBaseAmount.toFixed(2)} USD pour respecter le plafond Mobile Money de ${totalDebitCapUsd.toFixed(2)} USD (frais opérateur inclus).`;
}

export function buildPremiumEducationHint(baseAmount: number): string | null {
  if (baseAmount > 1000) {
    return "💡 Pour ce montant, privilégiez un compte Mobile Money Premium pour un paiement plus fluide.";
  }
  if (baseAmount > 750) {
    return "💡 Montant élevé: vérifiez que le compte Mobile Money est bien activé pour ce plafond.";
  }
  if (baseAmount > 100) {
    return "💡 Si le compte est standard, un passage en Premium peut éviter un refus opérateur.";
  }
  return null;
}
