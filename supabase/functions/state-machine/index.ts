import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  autoSuspendUserIfNeeded,
  enforceUserHourlyRateLimit,
  isUserSuspended,
  setUserSuspension,
} from "../_shared/abusePrevention.ts";
import { initiateDepositForTransaction } from "../_shared/depositFlow.ts";
import { assessPayoutFloat } from "../_shared/floatMonitor.ts";
import { jsonResponse } from "../_shared/http.ts";
import { normalizeDrPhoneToE164OrThrow } from "../_shared/phone.ts";
import {
  constantTimePinEquals,
  generateSecure4DigitPin,
  isValid4DigitPin,
} from "../_shared/pin.ts";
import { initiatePayoutForTransaction } from "../_shared/payoutFlow.ts";
import { initiateRefundForTransaction } from "../_shared/refundFlow.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";
import { getTrustScoresForParties } from "../_shared/trustScore.ts";
import { sendWhatsAppTextMessage } from "../_shared/whatsappMessaging.ts";
import {
  buildInitiatedTransactionButtons,
  buildInitiatedTransactionPrompt,
  sendInteractiveButtonsMessage,
} from "../_shared/whatsappInteractive.ts";

export enum TransactionStatus {
  INITIATED = "INITIATED",
  PENDING_FUNDING = "PENDING_FUNDING",
  SECURED = "SECURED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  PIN_FAILED_LOCKED = "PIN_FAILED_LOCKED",
  PAYOUT_FAILED = "PAYOUT_FAILED",
  PAYOUT_DELAYED = "PAYOUT_DELAYED",
}

export enum StateEvent {
  CREATE_TRANSACTION = "CREATE_TRANSACTION",
  COUNTERPARTY_ACCEPT = "COUNTERPARTY_ACCEPT",
  COUNTERPARTY_REJECT = "COUNTERPARTY_REJECT",
  DEPOSIT_CONFIRMED = "DEPOSIT_CONFIRMED",
  PIN_VALIDATED = "PIN_VALIDATED",
  PIN_FAILED_LOCK = "PIN_FAILED_LOCK",
  PAYOUT_SUCCEEDED = "PAYOUT_SUCCEEDED",
  PAYOUT_HARD_FAILED = "PAYOUT_HARD_FAILED",
  PAYOUT_TIMEOUT = "PAYOUT_TIMEOUT",
  REFUND_COMPLETED = "REFUND_COMPLETED",
  TTL_EXPIRED = "TTL_EXPIRED",
  CANCEL_REQUESTED = "CANCEL_REQUESTED",
}

type TransitionMatrix = Record<
  TransactionStatus,
  Partial<Record<StateEvent, TransactionStatus>>
>;

const TRANSITION_MATRIX: TransitionMatrix = {
  [TransactionStatus.INITIATED]: {
    [StateEvent.COUNTERPARTY_ACCEPT]: TransactionStatus.PENDING_FUNDING,
    [StateEvent.COUNTERPARTY_REJECT]: TransactionStatus.CANCELLED,
    [StateEvent.CANCEL_REQUESTED]: TransactionStatus.CANCELLED,
    [StateEvent.TTL_EXPIRED]: TransactionStatus.CANCELLED,
  },
  [TransactionStatus.PENDING_FUNDING]: {
    [StateEvent.DEPOSIT_CONFIRMED]: TransactionStatus.SECURED,
    [StateEvent.CANCEL_REQUESTED]: TransactionStatus.CANCELLED,
    [StateEvent.TTL_EXPIRED]: TransactionStatus.CANCELLED,
  },
  [TransactionStatus.SECURED]: {
    [StateEvent.PIN_VALIDATED]: TransactionStatus.COMPLETED,
    [StateEvent.PIN_FAILED_LOCK]: TransactionStatus.PIN_FAILED_LOCKED,
    [StateEvent.PAYOUT_HARD_FAILED]: TransactionStatus.PAYOUT_FAILED,
    [StateEvent.PAYOUT_TIMEOUT]: TransactionStatus.PAYOUT_DELAYED,
    [StateEvent.TTL_EXPIRED]: TransactionStatus.CANCELLED,
  },
  [TransactionStatus.PAYOUT_DELAYED]: {
    [StateEvent.PAYOUT_SUCCEEDED]: TransactionStatus.COMPLETED,
    [StateEvent.PAYOUT_HARD_FAILED]: TransactionStatus.PAYOUT_FAILED,
  },
  [TransactionStatus.PAYOUT_FAILED]: {
    [StateEvent.REFUND_COMPLETED]: TransactionStatus.CANCELLED,
  },
  [TransactionStatus.PIN_FAILED_LOCKED]: {
    [StateEvent.REFUND_COMPLETED]: TransactionStatus.CANCELLED,
  },
  [TransactionStatus.COMPLETED]: {},
  [TransactionStatus.CANCELLED]: {},
};

interface CreateTransactionInput {
  senderPhone: string;
  messageText: string;
}

interface TransitionInput {
  transactionId: string;
  event: StateEvent;
  reason?: string;
  changedBy?: string;
}

interface RequestBody {
  action:
    | "create_transaction"
    | "transition_status"
    | "generate_pin"
    | "validate_pin"
    | "initiate_deposit"
    | "initiate_payout"
    | "initiate_refund"
    | "set_user_suspension"
    | "set_requires_human";
  sender_phone?: string;
  message_text?: string;
  transaction_id?: string;
  event?: StateEvent;
  reason?: string;
  changed_by?: string;
  submitted_pin?: string;
  refund_reason?: "TTL_EXPIRED" | "USER_CANCELLED";
  target_phone?: string;
  suspended?: boolean;
  requires_human?: boolean;
}

interface TransactionRow {
  id: string;
  status: TransactionStatus;
}

interface PinTransactionRow {
  id: string;
  status: TransactionStatus;
  secret_pin: string | null;
  pin_attempts: number;
}

interface CreateTransactionResult {
  initiatorRole: "SELLER" | "BUYER";
  sellerPhone: string;
  buyerPhone: string;
  amount: number;
  itemDescription: string;
}

interface CompletionNotificationTransactionRow {
  id: string;
  status: TransactionStatus;
  buyer_phone: string;
  seller_phone: string;
  base_amount: number;
  clairtus_fee: number;
  item_description: string | null;
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function isAutoPaymentBypassEnabled(): boolean {
  const raw = (Deno.env.get("AUTO_MARK_PAYMENT_SECURED") ?? "false").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

async function incrementSuccessfulTransactions(phoneNumber: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: user, error } = await supabase
    .from("users")
    .select("successful_transactions")
    .eq("phone_number", phoneNumber)
    .single();

  if (error || !user) {
    throw new Error(`User not found for success increment: ${phoneNumber}`);
  }

  const current = (user as { successful_transactions: number }).successful_transactions;
  const { error: updateError } = await supabase
    .from("users")
    .update({
      successful_transactions: current + 1,
      last_transaction_at: new Date().toISOString(),
    })
    .eq("phone_number", phoneNumber);

  if (updateError) {
    throw new Error(`Failed to increment successful_transactions: ${updateError.message}`);
  }
}

async function sendCompletionCelebrationMessages(
  transaction: CompletionNotificationTransactionRow,
): Promise<void> {
  const payoutAmount = (Math.round((transaction.base_amount - transaction.clairtus_fee) * 100) /
    100)
    .toFixed(2);
  const itemLabel = transaction.item_description?.trim() || "votre article";

  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.seller_phone,
    transactionId: transaction.id,
    messageText:
      `🎉 Paiement confirmé.\n\nCode PIN validé.\nVos fonds (${payoutAmount} USD) sont en route vers votre compte Mobile Money.`,
  });
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.seller_phone,
    transactionId: transaction.id,
    messageText:
      `👏 Félicitations pour la vente de ${itemLabel}.\n\nContinuez à vendre avec Clairtus pour des transactions toujours sécurisées.`,
  });

  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.buyer_phone,
    transactionId: transaction.id,
    messageText: "✅ Transaction terminée.\n\nLe vendeur a reçu son paiement.",
  });
  await sendWhatsAppTextMessage({
    recipientPhoneE164: transaction.buyer_phone,
    transactionId: transaction.id,
    messageText:
      `🥳 Félicitations pour votre achat de ${itemLabel}.\n\nContinuez à acheter avec Clairtus en toute confiance.`,
  });
}

async function completeTransactionAfterPinInTestMode(
  transactionId: string,
): Promise<Record<string, unknown>> {
  const supabase = createServiceRoleClient();
  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select("id, status, buyer_phone, seller_phone, base_amount, clairtus_fee, item_description")
    .eq("id", transactionId)
    .single();

  if (txError || !tx) {
    throw new Error("Transaction introuvable pour la finalisation test.");
  }

  const transaction = tx as CompletionNotificationTransactionRow;
  const oldStatus = transaction.status;
  if (oldStatus !== TransactionStatus.SECURED) {
    throw new Error("Finalisation test autorisée uniquement depuis le statut SECURED.");
  }

  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update({ status: TransactionStatus.COMPLETED })
    .eq("id", transactionId)
    .eq("status", TransactionStatus.SECURED)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    throw new Error(`Échec de transition vers COMPLETED: ${updateError?.message ?? "not updated"}`);
  }

  await supabase.from("transaction_status_log").insert({
    transaction_id: transaction.id,
    old_status: oldStatus,
    new_status: TransactionStatus.COMPLETED,
    event: StateEvent.PAYOUT_SUCCEEDED,
    reason: "Auto-completed in test mode after PIN validation",
    changed_by: "STATE_MACHINE",
  });

  await incrementSuccessfulTransactions(transaction.buyer_phone);
  await incrementSuccessfulTransactions(transaction.seller_phone);
  await sendCompletionCelebrationMessages(transaction);

  return {
    transaction_id: transaction.id,
    auto_completed: true,
    old_status: oldStatus,
    new_status: TransactionStatus.COMPLETED,
    completion_source: "TEST_MODE_PIN_VALIDATION",
  };
}

function parseTransactionCreationMessage(
  senderPhone: string,
  messageText: string,
): CreateTransactionResult {
  const trimmed = messageText.trim();
  const match = /^(vente|achat)\s+([0-9]+(?:[.,][0-9]{1,2})?)\s+(usd)\s+(.+?)\s+au\s+(\+?[0-9\s\-().]+)$/i
    .exec(trimmed);

  if (!match) {
    throw new Error(
      "Format invalide.\n\nUtilisez : Vente [Montant] USD [Article] au [Numéro]",
    );
  }

  const command = match[1].toUpperCase();
  const amountRaw = match[2].replace(",", ".");
  const currency = match[3].toUpperCase();
  const itemDescription = match[4].trim();
  const counterpartyRawPhone = match[5].trim();

  const baseAmount = Number.parseFloat(amountRaw);
  if (!Number.isFinite(baseAmount) || baseAmount < 1 || baseAmount > 2500) {
    throw new Error("Montant invalide.\n\nLe montant doit être compris entre 1 et 2500 USD.");
  }

  if (currency !== "USD") {
    throw new Error("Devise invalide.\n\nSeule la devise USD est acceptée.");
  }

  if (!itemDescription) {
    throw new Error("Description de l'article manquante.\n\nAjoutez le nom de l'article ou du service.");
  }

  const initiatorPhone = normalizeDrPhoneToE164OrThrow(senderPhone);
  const counterpartyPhone = normalizeDrPhoneToE164OrThrow(counterpartyRawPhone);

  if (initiatorPhone === counterpartyPhone) {
    throw new Error("Le vendeur et l'acheteur doivent être différents.");
  }

  if (command === "VENTE") {
    return {
      initiatorRole: "SELLER",
      sellerPhone: initiatorPhone,
      buyerPhone: counterpartyPhone,
      amount: roundToCents(baseAmount),
      itemDescription,
    };
  }

  return {
    initiatorRole: "BUYER",
    sellerPhone: counterpartyPhone,
    buyerPhone: initiatorPhone,
    amount: roundToCents(baseAmount),
    itemDescription,
  };
}

async function ensureUserExists(phoneNumber: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("users").upsert(
    { phone_number: phoneNumber },
    { onConflict: "phone_number", ignoreDuplicates: false },
  );
}

async function getUserDisplayName(phoneNumber: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("users")
    .select("first_name, last_name")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (!data) {
    return phoneNumber;
  }
  const row = data as { first_name: string | null; last_name: string | null };
  const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return fullName || phoneNumber;
}

async function createTransactionFromMessage(
  input: CreateTransactionInput,
): Promise<Record<string, unknown>> {
  const floatAssessment = await assessPayoutFloat({ forceRefresh: false });
  if (floatAssessment.blocked) {
    throw new Error(
      "⚠️ Clairtus est momentanément en maintenance pour garantir la liquidité.\n\nMerci de réessayer plus tard.",
    );
  }

  const parsed = parseTransactionCreationMessage(input.senderPhone, input.messageText);
  const initiatorPhone = normalizeDrPhoneToE164OrThrow(input.senderPhone);
  const mnoFee = roundToCents(parsed.amount * 0.015);
  const clairtusFee = roundToCents(parsed.amount * 0.025);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await ensureUserExists(parsed.sellerPhone);
  await ensureUserExists(parsed.buyerPhone);

  const initiatorSuspended = await isUserSuspended(initiatorPhone);
  if (initiatorSuspended) {
    throw new Error("🚫 Votre compte est temporairement suspendu.\n\nContactez l'assistance Clairtus.");
  }

  // Block when either party is already suspended to stop new transaction flow.
  const counterpartyPhone = parsed.initiatorRole === "SELLER"
    ? parsed.buyerPhone
    : parsed.sellerPhone;
  const counterpartySuspended = await isUserSuspended(counterpartyPhone);
  if (counterpartySuspended) {
    throw new Error(
      "🚫 La contrepartie est suspendue.\n\nImpossible de démarrer une nouvelle transaction.",
    );
  }

  const rateLimit = await enforceUserHourlyRateLimit(initiatorPhone);
  if (!rateLimit.allowed) {
    throw new Error("⏳ Limite atteinte.\n\nVeuillez réessayer dans 1 heure.");
  }

  const supabase = createServiceRoleClient();
  const { data: inserted, error } = await supabase
    .from("transactions")
    .insert({
      status: TransactionStatus.INITIATED,
      expires_at: expiresAt,
      seller_phone: parsed.sellerPhone,
      buyer_phone: parsed.buyerPhone,
      initiator_phone: initiatorPhone,
      item_description: parsed.itemDescription,
      currency: "USD",
      base_amount: parsed.amount,
      mno_fee: mnoFee,
      clairtus_fee: clairtusFee,
    })
    .select(
      "id, status, seller_phone, buyer_phone, initiator_phone, currency, base_amount, mno_fee, clairtus_fee, created_at, expires_at",
    )
    .single();

  if (error || !inserted) {
    throw new Error(
      "⚠️ Impossible de créer la transaction pour le moment.\n\nMerci de réessayer dans un instant.",
    );
  }

  const trustScores = await getTrustScoresForParties(
    parsed.sellerPhone,
    parsed.buyerPhone,
  );

  const insertedTransaction = inserted as {
    id: string;
    status: string;
    seller_phone: string;
    buyer_phone: string;
    initiator_phone: string;
    currency: string;
    base_amount: number;
    mno_fee: number;
    clairtus_fee: number;
    created_at: string;
    expires_at: string;
  };

  const initiatorTrust = parsed.initiatorRole === "SELLER"
    ? trustScores.seller
    : trustScores.buyer;
  const initiatorDisplayName = await getUserDisplayName(initiatorPhone);
  const recipientRole: "BUYER" | "SELLER" = parsed.initiatorRole === "SELLER"
    ? "BUYER"
    : "SELLER";
  const counterpartyForPrompt = parsed.initiatorRole === "SELLER"
    ? parsed.buyerPhone
    : parsed.sellerPhone;

  let interactiveDispatch: Record<string, unknown>;
  try {
    const bodyText = buildInitiatedTransactionPrompt({
      transactionId: insertedTransaction.id,
      initiatorDisplayName,
      recipientRole,
      sellerPhone: parsed.sellerPhone,
      itemDescription: parsed.itemDescription,
      baseAmount: parsed.amount,
      initiatorTrustScore: initiatorTrust.displayText,
    });
    const sendResult = await sendInteractiveButtonsMessage({
      recipientPhoneE164: counterpartyForPrompt,
      bodyText,
      buttons: buildInitiatedTransactionButtons(insertedTransaction.id),
    });
    interactiveDispatch = {
      sent: sendResult.sent,
      response_status: sendResult.responseStatus,
    };
  } catch (error) {
    const supabase = createServiceRoleClient();
    await supabase.from("error_logs").insert({
      transaction_id: insertedTransaction.id,
      error_type: "WHATSAPP_INTERACTIVE_SEND_FAILED",
      error_message: error instanceof Error ? error.message : "Unknown error",
      error_details: {
        component: "state-machine",
        transaction_id: insertedTransaction.id,
      },
    });
    interactiveDispatch = {
      sent: false,
      response_status: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  return {
    transaction: insertedTransaction,
    trust_scores: {
      seller: {
        phone: trustScores.seller.phoneNumber,
        display: trustScores.seller.displayText,
        successful_transactions: trustScores.seller.successfulTransactions,
        cancelled_transactions: trustScores.seller.cancelledTransactions,
        source: trustScores.seller.source,
        latency_ms: trustScores.seller.latencyMs,
      },
      buyer: {
        phone: trustScores.buyer.phoneNumber,
        display: trustScores.buyer.displayText,
        successful_transactions: trustScores.buyer.successfulTransactions,
        cancelled_transactions: trustScores.buyer.cancelledTransactions,
        source: trustScores.buyer.source,
        latency_ms: trustScores.buyer.latencyMs,
      },
    },
    trust_score_sla_met: trustScores.seller.latencyMs <= 500 &&
      trustScores.buyer.latencyMs <= 500,
    interactive_button_dispatch: interactiveDispatch,
  };
}

function getNextStatus(
  currentStatus: TransactionStatus,
  event: StateEvent,
): TransactionStatus {
  const nextStatus = TRANSITION_MATRIX[currentStatus][event];
  if (!nextStatus) {
    throw new Error(
      `Invalid transition: ${currentStatus} -> (${event}) is not allowed`,
    );
  }
  return nextStatus;
}

async function applyStatusTransitionAtomic(
  input: TransitionInput,
): Promise<Record<string, unknown>> {
  const supabase = createServiceRoleClient();
  const { data: current, error: currentError } = await supabase
    .from("transactions")
    .select("id, status")
    .eq("id", input.transactionId)
    .single();

  if (currentError || !current) {
    throw new Error("Transaction introuvable pour la transition.");
  }

  const currentRow = current as TransactionRow;
  const currentStatus = currentRow.status;
  const nextStatus = getNextStatus(currentStatus, input.event);

  // Compare-and-set update guards against concurrent stale transitions.
  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update({ status: nextStatus })
    .eq("id", input.transactionId)
    .eq("status", currentStatus)
    .select("id, status, updated_at")
    .single();

  if (updateError || !updated) {
    throw new Error("La transition a échoué (conflit ou erreur base de données).");
  }

  const { error: logError } = await supabase.from("transaction_status_log").insert({
    transaction_id: input.transactionId,
    old_status: currentStatus,
    new_status: nextStatus,
    event: input.event,
    reason: input.reason ?? "State transition applied",
    changed_by: input.changedBy ?? "STATE_MACHINE",
  });

  if (logError) {
    throw new Error(`Impossible d'enregistrer l'historique de transition : ${logError.message}`);
  }

  return {
    transaction_id: input.transactionId,
    old_status: currentStatus,
    new_status: nextStatus,
    event: input.event,
  };
}

async function generatePinForSecuredTransaction(
  transactionId: string,
): Promise<Record<string, unknown>> {
  const supabase = createServiceRoleClient();
  const { data: current, error: currentError } = await supabase
    .from("transactions")
    .select("id, status, secret_pin, pin_attempts")
    .eq("id", transactionId)
    .single();

  if (currentError || !current) {
    throw new Error("Transaction introuvable pour la génération du code PIN.");
  }

  const transaction = current as PinTransactionRow;
  if (transaction.status !== TransactionStatus.SECURED) {
    throw new Error("La génération du code PIN est possible uniquement si la transaction est sécurisée.");
  }

  if (transaction.secret_pin && isValid4DigitPin(transaction.secret_pin)) {
    return {
      transaction_id: transaction.id,
      generated: false,
      secret_pin: transaction.secret_pin,
      message:
        "PIN deja existant. Reutilisation du PIN actuel pour idempotence.",
    };
  }

  const secretPin = generateSecure4DigitPin();
  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update({ secret_pin: secretPin, pin_attempts: 0 })
    .eq("id", transactionId)
    .eq("status", TransactionStatus.SECURED)
    .select("id, status, secret_pin, pin_attempts")
    .single();

  if (updateError || !updated) {
    throw new Error(
      `Impossible d'enregistrer le code PIN généré : ${updateError?.message ?? "erreur inconnue"}`,
    );
  }

  return {
    transaction_id: (updated as PinTransactionRow).id,
    generated: true,
    secret_pin: (updated as PinTransactionRow).secret_pin,
    buyer_notification:
      "🔐 Paiement Bloqué. Voici votre code PIN de livraison: [XXXX]",
    vendor_notification:
      "✅ Fonds Sécurisés! Le client a bloqué [Montant] USD. Livrez la commande. Demandez au client son Code PIN à 4 chiffres et envoyez-le ici pour être payé.",
  };
}

async function validateSubmittedPin(
  transactionId: string,
  submittedPin: string,
): Promise<Record<string, unknown>> {
  if (!isValid4DigitPin(submittedPin)) {
    throw new Error("Code PIN invalide.\n\nEntrez un code numérique à 4 chiffres.");
  }

  const supabase = createServiceRoleClient();
  const { data: current, error: currentError } = await supabase
    .from("transactions")
    .select("id, status, secret_pin, pin_attempts")
    .eq("id", transactionId)
    .single();

  if (currentError || !current) {
    throw new Error("Transaction introuvable pour la validation du code PIN.");
  }

  const transaction = current as PinTransactionRow;
  if (transaction.status !== TransactionStatus.SECURED) {
    throw new Error("Validation impossible.\n\nCette transaction n'est pas encore sécurisée.");
  }
  if (!transaction.secret_pin) {
    throw new Error("Aucun code PIN sécurisé n'est défini pour cette transaction.");
  }

  const isMatch = constantTimePinEquals(submittedPin, transaction.secret_pin);
  if (isMatch) {
    const { error: resetError } = await supabase
      .from("transactions")
      .update({ pin_attempts: 0 })
      .eq("id", transactionId)
      .eq("status", TransactionStatus.SECURED);

    if (resetError) {
      throw new Error(
        "⚠️ Le code est valide, mais un incident technique empêche la suite.\n\nMerci de réessayer.",
      );
    }

    return {
      transaction_id: transaction.id,
      pin_valid: true,
      pin_attempts: 0,
      message: "✅ Code PIN valide.\n\nNous lançons le transfert vers le vendeur.",
    };
  }

  const nextAttempts = Math.min(transaction.pin_attempts + 1, 3);
  if (nextAttempts < 3) {
    const { error: attemptError } = await supabase
      .from("transactions")
      .update({ pin_attempts: nextAttempts })
      .eq("id", transactionId)
      .eq("status", TransactionStatus.SECURED);

    if (attemptError) {
      throw new Error("⚠️ Incident temporaire.\n\nMerci de réessayer dans un instant.");
    }

    return {
      transaction_id: transaction.id,
      pin_valid: false,
      pin_attempts: nextAttempts,
      status: TransactionStatus.SECURED,
      message: `❌ Code incorrect.\n\nVeuillez réessayer. (${nextAttempts}/3 tentatives)`,
    };
  }

  const { data: locked, error: lockError } = await supabase
    .from("transactions")
    .update({
      pin_attempts: 3,
      status: TransactionStatus.PIN_FAILED_LOCKED,
      requires_human: true,
    })
    .eq("id", transactionId)
    .eq("status", TransactionStatus.SECURED)
    .select("id, status, pin_attempts, requires_human")
    .single();

  if (lockError || !locked) {
    throw new Error("⚠️ Incident temporaire.\n\nMerci de réessayer dans un instant.");
  }

  const { error: logError } = await supabase.from("transaction_status_log").insert({
    transaction_id: transaction.id,
    old_status: TransactionStatus.SECURED,
    new_status: TransactionStatus.PIN_FAILED_LOCKED,
    event: StateEvent.PIN_FAILED_LOCK,
    reason: "Maximum PIN attempts reached",
    changed_by: "PIN_VALIDATION",
  });

  if (logError) {
    throw new Error("⚠️ Incident temporaire.\n\nMerci de réessayer dans un instant.");
  }

  const { data: txParties } = await supabase
    .from("transactions")
    .select("seller_phone")
    .eq("id", transactionId)
    .single();
  const sellerPhone = (txParties as { seller_phone: string } | null)?.seller_phone;
  let autoSuspension: { suspended: boolean; pinLockedCount: number } | null = null;
  if (sellerPhone) {
    autoSuspension = await autoSuspendUserIfNeeded(sellerPhone);
  }

  return {
    transaction_id: transaction.id,
    pin_valid: false,
    pin_attempts: 3,
    status: TransactionStatus.PIN_FAILED_LOCKED,
    requires_human: true,
    buyer_notification:
      "🔒 Alerte sécurité\n\nLe vendeur a échoué 3 tentatives de code.\nVos fonds restent protégés.\n\nUn agent Clairtus vous contactera.",
    vendor_notification:
      "🚫 Transaction verrouillée après 3 tentatives.\n\nContactez l'assistance Clairtus.",
    message: "🚫 Transaction verrouillée après 3 tentatives incorrectes.",
    auto_suspension: autoSuspension,
  };
}

serve(async (request: Request): Promise<Response> => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = (await request.json()) as RequestBody;

    if (body.action === "create_transaction") {
      if (!body.sender_phone || !body.message_text) {
        return jsonResponse(
          { error: "sender_phone and message_text are required" },
          400,
        );
      }

      const transaction = await createTransactionFromMessage({
        senderPhone: body.sender_phone,
        messageText: body.message_text,
      });
      return jsonResponse({
        ok: true,
        action: body.action,
        transaction,
      });
    }

    if (body.action === "transition_status") {
      if (!body.transaction_id || !body.event) {
        return jsonResponse(
          { error: "transaction_id and event are required" },
          400,
        );
      }

      const transition = await applyStatusTransitionAtomic({
        transactionId: body.transaction_id,
        event: body.event,
        reason: body.reason,
        changedBy: body.changed_by,
      });

      return jsonResponse({
        ok: true,
        action: body.action,
        transition,
      });
    }

    if (body.action === "initiate_deposit") {
      if (!body.transaction_id) {
        return jsonResponse({ error: "transaction_id is required" }, 400);
      }
      const result = await initiateDepositForTransaction(body.transaction_id);
      return jsonResponse({
        ok: true,
        action: body.action,
        result,
      });
    }

    if (body.action === "generate_pin") {
      if (!body.transaction_id) {
        return jsonResponse({ error: "transaction_id is required" }, 400);
      }

      const result = await generatePinForSecuredTransaction(body.transaction_id);
      return jsonResponse({
        ok: true,
        action: body.action,
        result,
      });
    }

    if (body.action === "validate_pin") {
      if (!body.transaction_id || !body.submitted_pin) {
        return jsonResponse(
          { error: "transaction_id and submitted_pin are required" },
          400,
        );
      }

      const result = await validateSubmittedPin(
        body.transaction_id,
        body.submitted_pin,
      );
      if (result.pin_valid === true) {
        const payout = isAutoPaymentBypassEnabled()
          ? await completeTransactionAfterPinInTestMode(body.transaction_id)
          : await initiatePayoutForTransaction(body.transaction_id);
        return jsonResponse({
          ok: true,
          action: body.action,
          result,
          payout,
        });
      }
      return jsonResponse({
        ok: true,
        action: body.action,
        result,
      });
    }

    if (body.action === "initiate_payout") {
      if (!body.transaction_id) {
        return jsonResponse({ error: "transaction_id is required" }, 400);
      }

      const result = await initiatePayoutForTransaction(body.transaction_id);
      return jsonResponse({
        ok: true,
        action: body.action,
        result,
      });
    }

    if (body.action === "initiate_refund") {
      if (!body.transaction_id || !body.refund_reason) {
        return jsonResponse(
          { error: "transaction_id and refund_reason are required" },
          400,
        );
      }
      const result = await initiateRefundForTransaction({
        transactionId: body.transaction_id,
        reason: body.refund_reason,
      });
      return jsonResponse({
        ok: true,
        action: body.action,
        result,
      });
    }

    if (body.action === "set_user_suspension") {
      if (!body.target_phone || typeof body.suspended !== "boolean") {
        return jsonResponse(
          { error: "target_phone and suspended(boolean) are required" },
          400,
        );
      }
      const phone = normalizeDrPhoneToE164OrThrow(body.target_phone);
      await setUserSuspension(phone, body.suspended);
      return jsonResponse({
        ok: true,
        action: body.action,
        result: { phone, suspended: body.suspended },
      });
    }

    if (body.action === "set_requires_human") {
      if (!body.transaction_id || typeof body.requires_human !== "boolean") {
        return jsonResponse(
          { error: "transaction_id and requires_human(boolean) are required" },
          400,
        );
      }
      const supabase = createServiceRoleClient();
      const { data: currentTx, error: currentTxError } = await supabase
        .from("transactions")
        .select("status, requires_human")
        .eq("id", body.transaction_id)
        .maybeSingle();

      if (currentTxError) {
        throw new Error(`Impossible de lire l'état actuel de la transaction : ${currentTxError.message}`);
      }
      if (!currentTx) {
        throw new Error("Transaction introuvable pour l'activation de l'assistance humaine.");
      }

      const { error } = await supabase
        .from("transactions")
        .update({
          requires_human: body.requires_human,
        })
        .eq("id", body.transaction_id);

      if (error) {
        throw new Error(`Impossible de mettre à jour l'assistance humaine : ${error.message}`);
      }

      return jsonResponse({
        ok: true,
        action: body.action,
        result: {
          transaction_id: body.transaction_id,
          requires_human: body.requires_human,
          status: currentTx.status,
        },
      });
    }

    return jsonResponse(
      {
        error:
          "Invalid action. Use create_transaction, transition_status, initiate_deposit, initiate_payout, initiate_refund, generate_pin, validate_pin, set_user_suspension, or set_requires_human.",
      },
      400,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        function: "state-machine",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
