import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  isUserSuspended,
} from "../_shared/abusePrevention.ts";
import { initiateDepositForTransaction } from "../_shared/depositFlow.ts";
import { jsonResponse } from "../_shared/http.ts";
import { normalizeDrPhoneToE164, PHONE_FORMAT_ERROR_MESSAGE } from "../_shared/phone.ts";
import { generateSecure4DigitPin } from "../_shared/pin.ts";
import { initiatePayoutForTransaction } from "../_shared/payoutFlow.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";
import { sendWhatsAppTextMessage } from "../_shared/whatsappMessaging.ts";
import {
  buildPrePaymentManagementButtons,
  parsePayoutButtonPayload,
  parseTransactionButtonPayload,
  sendInteractiveButtonsMessage,
  type PayoutButtonAction,
  type TransactionButtonAction,
} from "../_shared/whatsappInteractive.ts";

interface MetaTextMessage {
  from: string;
  type: "text";
  text?: {
    body?: string;
  };
}

interface MetaInteractiveMessage {
  from: string;
  type: "interactive";
  interactive?: {
    button_reply?: {
      id?: string;
      title?: string;
    };
  };
}

interface MetaButtonMessage {
  from: string;
  type: "button";
  button?: {
    payload?: string;
    text?: string;
  };
}

type MetaIncomingMessage = MetaTextMessage | MetaInteractiveMessage | MetaButtonMessage;

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: MetaIncomingMessage[];
      };
    }>;
  }>;
}

interface ParsedIncomingMessage {
  senderPhoneE164: string;
  messageType: "text" | "interactive_button";
  textBody: string;
  buttonPayload: string | null;
}

interface RejectedIncomingMessage {
  rawSenderPhone: string;
  messageType: "text" | "interactive_button" | "unknown";
  error: string;
}

type RoutedIntent =
  | "GUIDED_START"
  | "GUIDED_STEP"
  | "LIST_TRANSACTIONS"
  | "DETAIL_TRANSACTION"
  | "CANCEL_TRANSACTION"
  | "CREATE_TRANSACTION"
  | "BUTTON_ACCEPT"
  | "BUTTON_REJECT"
  | "RETRY_PAYOUT"
  | "HUMAN_SUPPORT"
  | "SUBMIT_PIN"
  | "UNKNOWN";

interface RoutedMessage {
  senderPhoneE164: string;
  messageType: "text" | "interactive_button";
  intent: RoutedIntent;
  normalizedInput: string;
  transactionId: string | null;
  action: TransactionButtonAction | PayoutButtonAction | null;
  responseMessage: string;
  allowed: boolean;
  rateLimitRemaining: number | null;
  transitionApplied: boolean;
  transitionDetails: Record<string, unknown> | null;
  responseDispatched?: boolean;
  createTransactionMessageText?: string;
  transactionReference?: string | null;
}

type GuidedMode = "SELL" | "BUY";
type GuidedStage = "AWAITING_ITEM" | "AWAITING_PRICE" | "AWAITING_COUNTERPARTY_PHONE";

interface GuidedMessageDraftRow {
  phone_number: string;
  mode: GuidedMode;
  stage: GuidedStage;
  item_description: string | null;
  amount_usd: number | null;
  updated_at: string;
}

type IdentityDraftStage = "AWAITING_FIRST_NAME" | "AWAITING_LAST_NAME";

interface IdentityDraftRow {
  phone_number: string;
  stage: IdentityDraftStage;
  first_name: string | null;
  updated_at: string;
  pending_message_type: "text" | "interactive_button" | null;
  pending_text_body: string | null;
  pending_button_payload: string | null;
}

const IDENTITY_DRAFT_EXPIRY_HOURS = 72;
const GUIDED_DRAFT_EXPIRY_HOURS = 72;

interface ActiveTransactionContextRow {
  id: string;
  status: string;
  seller_phone: string;
  buyer_phone: string;
  item_description: string | null;
}

interface UserTransactionRow {
  id: string;
  status: string;
  item_description: string;
  base_amount: number;
  currency: string;
  seller_phone: string;
  buyer_phone: string;
  created_at: string;
  updated_at: string;
}

interface StateMachineCreateTransactionResponse {
  ok?: boolean;
  error?: string;
  transaction?: {
    transaction?: {
      id?: string;
      status?: string;
      seller_phone?: string;
      buyer_phone?: string;
    };
    interactive_button_dispatch?: {
      sent?: boolean;
      response_status?: number;
    };
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

async function computeHmacSha256Hex(
  payload: Uint8Array,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digestBuffer = await crypto.subtle.sign("HMAC", key, payload);
  return bytesToHex(new Uint8Array(digestBuffer));
}

async function logSignatureFailure(
  reason: string,
  signatureHeader: string | null,
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("error_logs").insert({
      error_type: "WHATSAPP_SIGNATURE_VALIDATION_FAILED",
      error_message: reason,
      error_details: {
        component: "whatsapp-webhook",
        signature_header_present: signatureHeader !== null,
        signature_header_prefix: signatureHeader?.slice(0, 20) ?? null,
      },
    });
  } catch {
    // Do not block webhook response if logging fails.
  }
}

async function isMetaSignatureValid(
  payload: Uint8Array,
  signatureHeader: string,
  appSecret: string,
): Promise<boolean> {
  const signatureMatch = /^sha256=([a-fA-F0-9]{64})$/.exec(signatureHeader);
  if (!signatureMatch) {
    return false;
  }

  const expectedSignature = signatureMatch[1].toLowerCase();
  const computedSignature = await computeHmacSha256Hex(payload, appSecret);
  return constantTimeEquals(computedSignature, expectedSignature);
}

function parseIncomingMessages(payload: MetaWebhookPayload): {
  parsedMessages: ParsedIncomingMessage[];
  rejectedMessages: RejectedIncomingMessage[];
} {
  const parsedMessages: ParsedIncomingMessage[] = [];
  const rejectedMessages: RejectedIncomingMessage[] = [];
  const entries = payload.entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const normalizedPhone = normalizeDrPhoneToE164(message.from);
        if (!normalizedPhone.ok) {
          rejectedMessages.push({
            rawSenderPhone: message.from,
            messageType: message.type === "text" || message.type === "interactive" ||
                message.type === "button"
              ? (message.type === "text" ? "text" : "interactive_button")
              : "unknown",
            error: normalizedPhone.error,
          });
          continue;
        }
        const senderPhoneE164 = normalizedPhone.value;

        if (message.type === "text") {
          const textBody = message.text?.body?.trim();
          if (!textBody) {
            continue;
          }

          parsedMessages.push({
            senderPhoneE164,
            messageType: "text",
            textBody,
            buttonPayload: null,
          });
          continue;
        }

        if (message.type === "interactive") {
          const payloadId = message.interactive?.button_reply?.id?.trim();
          const title = message.interactive?.button_reply?.title?.trim() ?? "";
          if (!payloadId && !title) {
            continue;
          }

          parsedMessages.push({
            senderPhoneE164,
            messageType: "interactive_button",
            textBody: title || payloadId || "",
            buttonPayload: payloadId ?? null,
          });
          continue;
        }

        if (message.type === "button") {
          const payloadId = message.button?.payload?.trim();
          const title = message.button?.text?.trim() ?? "";
          if (!payloadId && !title) {
            continue;
          }

          parsedMessages.push({
            senderPhoneE164,
            messageType: "interactive_button",
            textBody: title || payloadId || "",
            buttonPayload: payloadId ?? null,
          });
        }
      }
    }
  }

  return { parsedMessages, rejectedMessages };
}

function normalizeForRouting(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function parseGuidedFlowSelection(message: ParsedIncomingMessage): GuidedMode | null {
  const payload = message.buttonPayload?.trim() ?? "";
  if (payload === "FLOW|SELL") {
    return "SELL";
  }
  if (payload === "FLOW|BUY") {
    return "BUY";
  }

  const normalizedText = normalizeForRouting(message.textBody);
  if (normalizedText === "VENDRE" || normalizedText === "JE VEUX VENDRE") {
    return "SELL";
  }
  if (normalizedText === "ACHETER" || normalizedText === "JE VEUX ACHETER") {
    return "BUY";
  }
  return null;
}

function isFrenchGreeting(input: string): boolean {
  const normalized = normalizeForRouting(input)
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return false;
  }
  const firstWord = normalized.split(" ")[0];
  return ["BONJOUR", "SALUT", "BONSOIR", "COUCOU", "BSR", "SLT"].includes(firstWord);
}

function isGuidedRestartRequest(input: string): boolean {
  const normalized = normalizeForRouting(input)
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [
    "NOUVELLE TRANSACTION",
    "NOUVELLE",
    "NOUVEAU",
    "COMMENCER",
    "RECOMMENCER",
    "DEMARRER",
    "START",
  ].includes(normalized);
}

function parseAmountFromInput(input: string): number | null {
  const normalized = input.trim().replace(",", ".").replace(/\s+/g, "");
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(normalized)) {
    return null;
  }
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 1 || value > 2500) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function buildTransactionReference(transactionId: string): string {
  const compact = transactionId.replace(/-/g, "").toUpperCase();
  return `CLT-${compact.slice(0, 8)}`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "INITIATED":
      return "En attente de réponse";
    case "PENDING_FUNDING":
      return "En attente de paiement";
    case "SECURED":
      return "Paiement sécurisé";
    case "PAYOUT_DELAYED":
      return "Transfert en attente réseau";
    case "PAYOUT_FAILED":
      return "Transfert à relancer";
    case "PIN_FAILED_LOCKED":
      return "Verrouillée (sécurité)";
    case "COMPLETED":
      return "Terminée";
    case "CANCELLED":
      return "Annulée";
    default:
      return status;
  }
}

function roleLabel(senderPhone: string, row: UserTransactionRow): "Acheteur" | "Vendeur" {
  return senderPhone === row.seller_phone ? "Vendeur" : "Acheteur";
}

function detailActionHint(senderPhone: string, row: UserTransactionRow): string {
  const isSeller = senderPhone === row.seller_phone;
  if (row.status === "INITIATED") {
    return isSeller
      ? "Action : en attente de la réponse de l'acheteur."
      : "Action : utilisez ACCEPTER, REFUSER ou AIDE.";
  }
  if (row.status === "PENDING_FUNDING") {
    return isSeller
      ? "Action : attendez la confirmation du paiement acheteur."
      : "Action : validez la demande Mobile Money.";
  }
  if (row.status === "SECURED") {
    return isSeller
      ? "Action : envoyez le code PIN client (4 chiffres)."
      : "Action : partagez le code PIN uniquement à la remise.";
  }
  if (row.status === "PAYOUT_FAILED") {
    return isSeller
      ? "Action : utilisez RÉESSAYER ou AIDE."
      : "Action : transfert en reprise côté vendeur.";
  }
  if (row.status === "PAYOUT_DELAYED") {
    return isSeller
      ? "Action : patientez ou utilisez RÉESSAYER / AIDE."
      : "Action : transfert en attente réseau.";
  }
  if (row.status === "COMPLETED") {
    return "Action : envoyez BONJOUR pour démarrer une nouvelle transaction.";
  }
  if (row.status === "CANCELLED") {
    return "Action : transaction clôturée. Envoyez BONJOUR pour recommencer.";
  }
  return "Action : envoyez AIDE si vous avez besoin d'assistance.";
}

function shouldResumePendingActionAfterIdentity(intent: RoutedIntent): boolean {
  return [
    "CANCEL_TRANSACTION",
    "CREATE_TRANSACTION",
    "BUTTON_ACCEPT",
    "BUTTON_REJECT",
    "HUMAN_SUPPORT",
    "RETRY_PAYOUT",
    "SUBMIT_PIN",
  ].includes(intent);
}

async function getLatestActiveTransactionForUser(
  senderPhoneE164: string,
): Promise<ActiveTransactionContextRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, status, seller_phone, buyer_phone, item_description")
    .or(`seller_phone.eq.${senderPhoneE164},buyer_phone.eq.${senderPhoneE164}`)
    .in(
      "status",
      ["INITIATED", "PENDING_FUNDING", "SECURED", "PAYOUT_FAILED", "PAYOUT_DELAYED", "PIN_FAILED_LOCKED"],
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data as ActiveTransactionContextRow;
}

async function getLatestTransactionStatusForUser(
  senderPhoneE164: string,
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("status")
    .or(`seller_phone.eq.${senderPhoneE164},buyer_phone.eq.${senderPhoneE164}`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return (data as { status: string }).status;
}

async function listUserTransactions(senderPhoneE164: string): Promise<UserTransactionRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, status, item_description, base_amount, currency, seller_phone, buyer_phone, created_at, updated_at",
    )
    .or(`seller_phone.eq.${senderPhoneE164},buyer_phone.eq.${senderPhoneE164}`)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error || !data) {
    return [];
  }
  return data as UserTransactionRow[];
}

function buildTransactionsListMessage(senderPhoneE164: string, rows: UserTransactionRow[]): string {
  if (rows.length === 0) {
    return [
      "📭 Vous n'avez pas encore de transaction.",
      "",
      "Pour démarrer, envoyez : BONJOUR",
    ].join("\n");
  }

  const lines = rows.map((row, index) => {
    const ref = buildTransactionReference(row.id);
    const role = roleLabel(senderPhoneE164, row);
    const status = statusLabel(row.status);
    return `${index + 1}) ${ref} • ${role}\n${row.item_description} • ${row.base_amount.toFixed(2)} $\nStatut : ${status}`;
  });

  return [
    "📚 Vos transactions récentes :",
    "",
    ...lines,
    "",
    "Pour voir le détail, envoyez : DETAIL CLT-XXXXXX",
  ].join("\n");
}

async function getTransactionByReferenceForUser(
  senderPhoneE164: string,
  reference: string,
): Promise<UserTransactionRow | null> {
  const normalizedRef = reference.replace(/^CLT-/i, "").trim().toLowerCase();
  if (!/^[0-9a-f]{6,12}$/.test(normalizedRef)) {
    return null;
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, status, item_description, base_amount, currency, seller_phone, buyer_phone, created_at, updated_at",
    )
    .or(`seller_phone.eq.${senderPhoneE164},buyer_phone.eq.${senderPhoneE164}`)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return null;
  }

  const rows = data as UserTransactionRow[];
  return rows.find((row) => row.id.replace(/-/g, "").toLowerCase().startsWith(normalizedRef)) ??
    null;
}

function buildTransactionDetailMessage(
  senderPhoneE164: string,
  row: UserTransactionRow,
): string {
  const ref = buildTransactionReference(row.id);
  const role = roleLabel(senderPhoneE164, row);
  const counterpartyPhone = senderPhoneE164 === row.seller_phone ? row.buyer_phone : row.seller_phone;
  const status = statusLabel(row.status);
  const hint = detailActionHint(senderPhoneE164, row);

  return [
    `📄 Détail ${ref}`,
    "",
    `Rôle : ${role}`,
    `Contrepartie : ${counterpartyPhone}`,
    `Article : ${row.item_description}`,
    `Montant : ${row.base_amount.toFixed(2)} $`,
    `Statut : ${status}`,
    "",
    hint,
  ].join("\n");
}

function buildRoleAwareFallbackMessage(
  senderPhoneE164: string,
  tx: ActiveTransactionContextRow | null,
  latestStatus: string | null,
): string {
  if (!tx) {
    if (latestStatus === "COMPLETED") {
      return [
        "✅ Votre dernière transaction est terminée.",
        "",
        "Souhaitez-vous démarrer une nouvelle transaction ?",
        "Si oui, envoyez : BONJOUR",
      ].join("\n");
    }

    return [
      "Je n'ai pas compris votre message.",
      "",
      "Pour démarrer facilement :",
      "• dites BONJOUR",
      "• puis choisissez VENDRE ou ACHETER",
      "",
      "Pour annuler une transaction en attente : ANNULER",
    ].join("\n");
  }

  const isSeller = senderPhoneE164 === tx.seller_phone;
  const itemLabel = tx.item_description?.trim() || "cet article";

  if (tx.status === "INITIATED") {
    return isSeller
      ? "📨 Transaction en cours.\n\nNous attendons la réponse de l'acheteur (ACCEPTER / REFUSER).\nVous pouvez aussi annuler avec ANNULER."
      : `📨 Demande reçue pour ${itemLabel}.\n\nUtilisez les boutons ACCEPTER, REFUSER ou AIDE.\nVous pouvez aussi annuler avec ANNULER.`;
  }
  if (tx.status === "PENDING_FUNDING") {
    return isSeller
      ? "⏳ Transaction en financement.\n\nNous attendons la confirmation du paiement acheteur.\nVous pouvez encore annuler avec ANNULER."
      : "💳 Paiement en attente.\n\nValidez la demande Mobile Money pour sécuriser la transaction.\nVous pouvez encore annuler avec ANNULER.";
  }
  if (tx.status === "SECURED") {
    return isSeller
      ? "🔐 Fonds sécurisés pour une transaction active.\n\nSi vous avez le code PIN client, envoyez simplement les 4 chiffres.\nPour démarrer une nouvelle transaction, dites BONJOUR."
      : "🔐 Paiement sécurisé pour une transaction active.\n\nPartagez votre code PIN uniquement à la remise de l'article.\nPour démarrer une nouvelle transaction, dites BONJOUR.";
  }
  if (tx.status === "PAYOUT_DELAYED") {
    return isSeller
      ? "⏳ Transfert en retard réseau.\n\nVos fonds restent sécurisés. Utilisez RÉESSAYER ou AIDE si besoin."
      : "⏳ Transfert vendeur en cours.\n\nLa transaction reste sécurisée pendant le traitement.";
  }
  if (tx.status === "PAYOUT_FAILED") {
    return isSeller
      ? "⚠️ Le transfert a échoué.\n\nUtilisez RÉESSAYER pour relancer, ou AIDE pour être assisté."
      : "⚠️ Le transfert vendeur a rencontré un incident.\n\nNous traitons la reprise en priorité.";
  }
  if (tx.status === "PIN_FAILED_LOCKED") {
    return "🆘 Transaction verrouillée pour sécurité.\n\nUtilisez AIDE pour contacter un agent Clairtus.";
  }
  return "Je n'ai pas compris votre message.\n\nDites BONJOUR pour reprendre étape par étape.";
}

function normalizePersonName(input: string): string | null {
  const compact = input.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]{2,50}$/.test(compact)) {
    return null;
  }
  return compact
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildGuidedIntroMessage(fullName?: string): string {
  return [
    fullName
      ? `👋 Bonjour ${fullName}, heureux de vous revoir sur Clairtus.`
      : "👋 Bonjour et bienvenue chez Clairtus.",
    "",
    "Clairtus sécurise vos transactions entre acheteur et vendeur :",
    "• l'acheteur paie en sécurité",
    "• le vendeur est payé après confirmation",
    "• tout est tracé pour protéger les deux parties",
    "",
    "Que souhaitez-vous faire aujourd'hui ?",
  ].join("\n");
}

async function ensureUserRow(phoneNumber: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("users")
    .upsert({ phone_number: phoneNumber }, { onConflict: "phone_number" });
  return !error;
}

async function getUserIdentity(phoneNumber: string): Promise<{
  firstName: string | null;
  lastName: string | null;
}> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("users")
    .select("first_name, last_name")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (error || !data) {
    return { firstName: null, lastName: null };
  }
  const row = data as { first_name: string | null; last_name: string | null };
  return { firstName: row.first_name, lastName: row.last_name };
}

async function getIdentityDraft(phoneNumber: string): Promise<IdentityDraftRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("user_identity_drafts")
    .select(
      "phone_number, stage, first_name, updated_at, pending_message_type, pending_text_body, pending_button_payload",
    )
    .eq("phone_number", phoneNumber)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data as IdentityDraftRow;
}

function isIdentityDraftExpired(updatedAtIso: string): boolean {
  const updatedAtMs = new Date(updatedAtIso).getTime();
  if (!Number.isFinite(updatedAtMs)) {
    return true;
  }
  const elapsedHours = (Date.now() - updatedAtMs) / (1000 * 60 * 60);
  return elapsedHours >= IDENTITY_DRAFT_EXPIRY_HOURS;
}

async function upsertIdentityDraft(input: {
  phoneNumber: string;
  stage: IdentityDraftStage;
  firstName?: string | null;
  pendingMessageType?: "text" | "interactive_button" | null;
  pendingTextBody?: string | null;
  pendingButtonPayload?: string | null;
}): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("user_identity_drafts").upsert(
    {
      phone_number: input.phoneNumber,
      stage: input.stage,
      first_name: input.firstName ?? null,
      pending_message_type: input.pendingMessageType ?? null,
      pending_text_body: input.pendingTextBody ?? null,
      pending_button_payload: input.pendingButtonPayload ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "phone_number" },
  );
  return !error;
}

async function clearIdentityDraft(phoneNumber: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("user_identity_drafts")
    .delete()
    .eq("phone_number", phoneNumber);
  return !error;
}

async function saveUserIdentity(
  phoneNumber: string,
  firstName: string,
  lastName: string,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("users")
    .update({ first_name: firstName, last_name: lastName })
    .eq("phone_number", phoneNumber);
  return !error;
}

async function getGuidedDraft(
  phoneNumber: string,
): Promise<GuidedMessageDraftRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("guided_message_drafts")
    .select("phone_number, mode, stage, item_description, amount_usd, updated_at")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (error) {
    return null;
  }
  if (!data) {
    return null;
  }
  return data as GuidedMessageDraftRow;
}

function isGuidedDraftExpired(updatedAtIso: string): boolean {
  const updatedAtMs = new Date(updatedAtIso).getTime();
  if (!Number.isFinite(updatedAtMs)) {
    return true;
  }
  const elapsedHours = (Date.now() - updatedAtMs) / (1000 * 60 * 60);
  return elapsedHours >= GUIDED_DRAFT_EXPIRY_HOURS;
}

async function upsertGuidedDraft(input: {
  phoneNumber: string;
  mode: GuidedMode;
  stage: GuidedStage;
  itemDescription?: string | null;
  amountUsd?: number | null;
}): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("guided_message_drafts").upsert(
    {
      phone_number: input.phoneNumber,
      mode: input.mode,
      stage: input.stage,
      item_description: input.itemDescription ?? null,
      amount_usd: input.amountUsd ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "phone_number" },
  );
  return !error;
}

async function clearGuidedDraft(phoneNumber: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("guided_message_drafts")
    .delete()
    .eq("phone_number", phoneNumber);
  return !error;
}

async function sendGuidedEntryButtons(phoneNumber: string, fullName?: string): Promise<boolean> {
  try {
    const dispatch = await sendInteractiveButtonsMessage({
      recipientPhoneE164: phoneNumber,
      bodyText: buildGuidedIntroMessage(fullName),
      buttons: [
        { id: "FLOW|SELL", title: "VENDRE" },
        { id: "FLOW|BUY", title: "ACHETER" },
      ],
    });
    return dispatch.sent;
  } catch {
    return false;
  }
}

function detectIntent(message: ParsedIncomingMessage): {
  intent: RoutedIntent;
  normalizedInput: string;
  transactionId: string | null;
  action: TransactionButtonAction | PayoutButtonAction | null;
  reference: string | null;
} {
  const parsedPayoutPayload = parsePayoutButtonPayload(message.buttonPayload);
  if (parsedPayoutPayload) {
    return {
      intent: "RETRY_PAYOUT",
      normalizedInput: parsedPayoutPayload.action,
      transactionId: parsedPayoutPayload.transactionId,
      action: parsedPayoutPayload.action,
      reference: null,
    };
  }

  const parsedPayload = parseTransactionButtonPayload(message.buttonPayload);
  if (parsedPayload) {
    if (parsedPayload.action === "ACCEPTER") {
      return {
        intent: "BUTTON_ACCEPT",
        normalizedInput: parsedPayload.action,
        transactionId: parsedPayload.transactionId,
        action: parsedPayload.action,
        reference: null,
      };
    }
    if (parsedPayload.action === "REFUSER") {
      return {
        intent: "BUTTON_REJECT",
        normalizedInput: parsedPayload.action,
        transactionId: parsedPayload.transactionId,
        action: parsedPayload.action,
        reference: null,
      };
    }
    if (parsedPayload.action === "ANNULER") {
      return {
        intent: "CANCEL_TRANSACTION",
        normalizedInput: parsedPayload.action,
        transactionId: parsedPayload.transactionId,
        action: parsedPayload.action,
        reference: null,
      };
    }
    return {
      intent: "HUMAN_SUPPORT",
      normalizedInput: parsedPayload.action,
      transactionId: parsedPayload.transactionId,
      action: parsedPayload.action,
      reference: null,
    };
  }

  const normalizedPayload = normalizeForRouting(message.buttonPayload ?? "");
  const normalizedText = normalizeForRouting(message.textBody);
  const normalizedInput = normalizedPayload || normalizedText;
  const textActionMatch = /^(ACCEPTER|REFUSER|AIDE|ANNULER)\s+([0-9a-fA-F-]{36})$/.exec(
    normalizedText,
  );
  if (textActionMatch) {
    const action = textActionMatch[1] as TransactionButtonAction;
    const transactionId = textActionMatch[2];
    if (action === "ACCEPTER") {
      return { intent: "BUTTON_ACCEPT", normalizedInput, transactionId, action, reference: null };
    }
    if (action === "REFUSER") {
      return { intent: "BUTTON_REJECT", normalizedInput, transactionId, action, reference: null };
    }
    if (action === "ANNULER") {
      return { intent: "CANCEL_TRANSACTION", normalizedInput, transactionId, action, reference: null };
    }
    return { intent: "HUMAN_SUPPORT", normalizedInput, transactionId, action, reference: null };
  }

  const isAccept = normalizedInput.includes("ACCEPTER") ||
    normalizedInput.includes("ACCEPT");
  if (isAccept) {
    return { intent: "BUTTON_ACCEPT", normalizedInput, transactionId: null, action: null, reference: null };
  }

  const isReject = normalizedInput.includes("REFUSER") ||
    normalizedInput.includes("REJECT");
  if (isReject) {
    return { intent: "BUTTON_REJECT", normalizedInput, transactionId: null, action: null, reference: null };
  }

  const isSupport = normalizedInput === "AIDE" ||
    normalizedInput === "HELP" ||
    normalizedInput === "SUPPORT";
  if (isSupport) {
    return { intent: "HUMAN_SUPPORT", normalizedInput, transactionId: null, action: null, reference: null };
  }

  const cancelActionMatch = /^(ANNULER|CANCEL)\s*([0-9a-fA-F-]{36})?$/.exec(normalizedText);
  if (cancelActionMatch) {
    const transactionId = cancelActionMatch[2] ?? null;
    return {
      intent: "CANCEL_TRANSACTION",
      normalizedInput,
      transactionId,
      action: null,
      reference: null,
    };
  }

  if (normalizedInput === "MES TRANSACTIONS" || normalizedInput === "HISTORIQUE" ||
    normalizedInput === "EN COURS") {
    return {
      intent: "LIST_TRANSACTIONS",
      normalizedInput,
      transactionId: null,
      action: null,
      reference: null,
    };
  }

  const detailMatch = /^(DETAIL|DETAILS|STATUT|SUIVI)\s+(CLT-[A-Z0-9]{6,12}|[A-Z0-9]{6,12})$/.exec(
    normalizedText,
  );
  if (detailMatch) {
    return {
      intent: "DETAIL_TRANSACTION",
      normalizedInput,
      transactionId: null,
      action: null,
      reference: detailMatch[2],
    };
  }

  const isPinInput = /^[0-9]{4}$/.test(normalizedText);
  if (isPinInput) {
    return { intent: "SUBMIT_PIN", normalizedInput, transactionId: null, action: null, reference: null };
  }

  const isTransactionText = /^(VENTE|ACHAT)\b/.test(normalizedText);
  if (isTransactionText) {
    return { intent: "CREATE_TRANSACTION", normalizedInput, transactionId: null, action: null, reference: null };
  }

  return { intent: "UNKNOWN", normalizedInput, transactionId: null, action: null, reference: null };
}

async function routeMessage(message: ParsedIncomingMessage): Promise<RoutedMessage> {
  const userRowReady = await ensureUserRow(message.senderPhoneE164);
  if (!userRowReady) {
    return {
      senderPhoneE164: message.senderPhoneE164,
      messageType: message.messageType,
      intent: "UNKNOWN",
      normalizedInput: normalizeForRouting(message.textBody),
      transactionId: null,
      action: null,
      responseMessage:
        "⚠️ Service momentanément indisponible.\n\nMerci de réessayer dans quelques instants.",
      allowed: false,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: {
        identity_user_upsert_failed: true,
      },
    };
  }

  const identity = await getUserIdentity(message.senderPhoneE164);
  const hasIdentity = Boolean(identity.firstName && identity.lastName);
  const normalizedText = normalizeForRouting(message.textBody);
  const pendingIntentCandidate = detectIntent(message);
  if (!hasIdentity) {
    let draft = await getIdentityDraft(message.senderPhoneE164);
    if (draft && isIdentityDraftExpired(draft.updated_at)) {
      await clearIdentityDraft(message.senderPhoneE164);
      draft = null;
    }

    if (!draft) {
      const shouldStorePendingAction = shouldResumePendingActionAfterIdentity(
        pendingIntentCandidate.intent,
      );
      const started = await upsertIdentityDraft({
        phoneNumber: message.senderPhoneE164,
        stage: "AWAITING_FIRST_NAME",
        pendingMessageType: shouldStorePendingAction ? message.messageType : null,
        pendingTextBody: shouldStorePendingAction ? message.textBody : null,
        pendingButtonPayload: shouldStorePendingAction ? message.buttonPayload : null,
      });
      return {
        senderPhoneE164: message.senderPhoneE164,
        messageType: message.messageType,
        intent: "GUIDED_START",
        normalizedInput: normalizedText,
        transactionId: null,
        action: null,
        responseMessage: started
          ? "👋 Reprenons ensemble.\n\nQuel est votre prénom ?"
          : "⚠️ Impossible de lancer l'inscription pour le moment.\n\nMerci de réessayer.",
        allowed: started,
        rateLimitRemaining: null,
        transitionApplied: false,
        transitionDetails: {
          identity_capture_started: started,
        },
      };
    }

    if (draft.stage === "AWAITING_FIRST_NAME") {
      const firstName = normalizePersonName(message.textBody);
      if (!firstName) {
        return {
          senderPhoneE164: message.senderPhoneE164,
          messageType: message.messageType,
          intent: "GUIDED_STEP",
          normalizedInput: normalizedText,
          transactionId: null,
          action: null,
          responseMessage:
            "Prénom invalide.\n\nEnvoyez uniquement votre prénom.\nExemple : Patrick",
          allowed: false,
          rateLimitRemaining: null,
          transitionApplied: false,
          transitionDetails: {
            identity_capture_stage: draft.stage,
          },
        };
      }

      const saved = await upsertIdentityDraft({
        phoneNumber: message.senderPhoneE164,
        stage: "AWAITING_LAST_NAME",
        firstName,
        pendingMessageType: draft.pending_message_type,
        pendingTextBody: draft.pending_text_body,
        pendingButtonPayload: draft.pending_button_payload,
      });
      return {
        senderPhoneE164: message.senderPhoneE164,
        messageType: message.messageType,
        intent: "GUIDED_STEP",
        normalizedInput: normalizedText,
        transactionId: null,
        action: null,
        responseMessage: saved
          ? "Merci 🙏\n\nEt votre nom de famille ?"
          : "⚠️ Impossible d'enregistrer ce prénom pour le moment.\n\nMerci de réessayer.",
        allowed: saved,
        rateLimitRemaining: null,
        transitionApplied: false,
        transitionDetails: {
          identity_capture_stage: "AWAITING_LAST_NAME",
        },
      };
    }

    const firstName = draft.first_name ? normalizePersonName(draft.first_name) : null;
    const lastName = normalizePersonName(message.textBody);
    if (!firstName || !lastName) {
      return {
        senderPhoneE164: message.senderPhoneE164,
        messageType: message.messageType,
        intent: "GUIDED_STEP",
        normalizedInput: normalizedText,
        transactionId: null,
        action: null,
        responseMessage:
          "Nom invalide.\n\nEnvoyez uniquement votre nom de famille.\nExemple : Mbuyi",
        allowed: false,
        rateLimitRemaining: null,
        transitionApplied: false,
        transitionDetails: {
          identity_capture_stage: "AWAITING_LAST_NAME",
        },
      };
    }

    const savedIdentity = await saveUserIdentity(message.senderPhoneE164, firstName, lastName);
    if (!savedIdentity) {
      return {
        senderPhoneE164: message.senderPhoneE164,
        messageType: message.messageType,
        intent: "GUIDED_STEP",
        normalizedInput: normalizedText,
        transactionId: null,
        action: null,
        responseMessage:
          "⚠️ Impossible d'enregistrer votre identité pour le moment.\n\nMerci de réessayer.",
        allowed: false,
        rateLimitRemaining: null,
        transitionApplied: false,
        transitionDetails: {
          identity_save_failed: true,
        },
      };
    }

    const pendingMessageType = draft.pending_message_type;
    const pendingTextBody = draft.pending_text_body;
    const pendingButtonPayload = draft.pending_button_payload;
    await clearIdentityDraft(message.senderPhoneE164);

    if (pendingMessageType && pendingTextBody !== null) {
      await sendWhatsAppTextMessage({
        recipientPhoneE164: message.senderPhoneE164,
        messageText:
          "✅ Merci, votre profil est enregistré.\n\nNous reprenons exactement là où vous en étiez.",
      });
      const resumedMessage: ParsedIncomingMessage = {
        senderPhoneE164: message.senderPhoneE164,
        messageType: pendingMessageType,
        textBody: pendingTextBody,
        buttonPayload: pendingButtonPayload ?? null,
      };
      return await routeMessage(resumedMessage);
    }

    const fullName = `${firstName} ${lastName}`;
    const menuSent = await sendGuidedEntryButtons(message.senderPhoneE164, fullName);
    return {
      senderPhoneE164: message.senderPhoneE164,
      messageType: message.messageType,
      intent: "GUIDED_START",
      normalizedInput: normalizedText,
      transactionId: null,
      action: null,
      responseMessage: menuSent
        ? `Enchanté, ${fullName} ✅\n\nVotre profil est prêt.`
        : `Enchanté, ${fullName} ✅\n\nVotre profil est prêt. Répondez VENDRE ou ACHETER.`,
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: {
        identity_saved: true,
        full_name: fullName,
        guided_menu_dispatched: menuSent,
      },
      responseDispatched: true,
    };
  }

  const guidedSelection = parseGuidedFlowSelection(message);
  let existingDraft = await getGuidedDraft(message.senderPhoneE164);
  let guidedDraftExpired = false;
  if (existingDraft && isGuidedDraftExpired(existingDraft.updated_at)) {
    await clearGuidedDraft(message.senderPhoneE164);
    existingDraft = null;
    guidedDraftExpired = true;
  }

  if (guidedDraftExpired && !guidedSelection) {
    const fullName = `${identity.firstName ?? ""} ${identity.lastName ?? ""}`.trim();
    const menuSent = await sendGuidedEntryButtons(message.senderPhoneE164, fullName || undefined);
    return {
      senderPhoneE164: message.senderPhoneE164,
      messageType: message.messageType,
      intent: "GUIDED_START",
      normalizedInput: normalizedText,
      transactionId: null,
      action: null,
      responseMessage: menuSent
        ? "⏳ Votre saisie précédente a expiré.\n\nOn repart sur une nouvelle transaction."
        : "⏳ Votre saisie précédente a expiré.\n\nRépondez VENDRE ou ACHETER pour recommencer.",
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: {
        guided_draft_expired: true,
        guided_menu_dispatched: menuSent,
      },
      responseDispatched: true,
    };
  }

  if (isGuidedRestartRequest(message.textBody)) {
    const fullName = `${identity.firstName ?? ""} ${identity.lastName ?? ""}`.trim();
    const menuSent = await sendGuidedEntryButtons(message.senderPhoneE164, fullName || undefined);
    return {
      senderPhoneE164: message.senderPhoneE164,
      messageType: message.messageType,
      intent: "GUIDED_START",
      normalizedInput: normalizedText,
      transactionId: null,
      action: null,
      responseMessage: menuSent
        ? "✅ Parfait.\n\nOn démarre une nouvelle transaction."
        : "✅ Parfait.\n\nRépondez VENDRE ou ACHETER pour démarrer une nouvelle transaction.",
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: {
        guided_restart_requested: true,
        guided_menu_dispatched: menuSent,
      },
      responseDispatched: true,
    };
  }

  if (existingDraft && /^(ANNULER|STOP|MENU)$/.test(normalizedText)) {
    await clearGuidedDraft(message.senderPhoneE164);
    const fullName = `${identity.firstName ?? ""} ${identity.lastName ?? ""}`.trim();
    const menuSent = await sendGuidedEntryButtons(message.senderPhoneE164, fullName || undefined);
    return {
      senderPhoneE164: message.senderPhoneE164,
      messageType: message.messageType,
      intent: "GUIDED_START",
      normalizedInput: normalizedText,
      transactionId: null,
      action: null,
      responseMessage: menuSent
        ? "✅ D'accord.\n\nOn repart de zéro."
        : "✅ D'accord.\n\nOn repart de zéro. Répondez VENDRE ou ACHETER.",
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: {
        guided_flow_reset: true,
        guided_menu_dispatched: menuSent,
      },
      responseDispatched: true,
    };
  }

  if (guidedSelection) {
    const saved = await upsertGuidedDraft({
      phoneNumber: message.senderPhoneE164,
      mode: guidedSelection,
      stage: "AWAITING_ITEM",
      itemDescription: null,
      amountUsd: null,
    });
    if (!saved) {
      return {
        senderPhoneE164: message.senderPhoneE164,
        messageType: message.messageType,
        intent: "GUIDED_START",
        normalizedInput: guidedSelection,
        transactionId: null,
        action: null,
        responseMessage:
          "⚠️ Le parcours guidé est momentanément indisponible.\n\nUtilisez ce format : Vente 900 USD MacBook Air M1 2020 au +243...",
        allowed: false,
        rateLimitRemaining: null,
        transitionApplied: false,
        transitionDetails: {
          guided_storage_error: true,
        },
      };
    }
    const subjectLabel = guidedSelection === "SELL" ? "vous vendez" : "vous achetez";
    return {
      senderPhoneE164: message.senderPhoneE164,
      messageType: message.messageType,
      intent: "GUIDED_START",
      normalizedInput: guidedSelection,
      transactionId: null,
      action: null,
      responseMessage:
        `Parfait ✅\n\nDécrivez brièvement ce que ${subjectLabel}.\nExemple : MacBook Air M1 2020`,
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: {
        guided_flow_mode: guidedSelection,
        guided_flow_stage: "AWAITING_ITEM",
      },
    };
  }

  if (existingDraft) {
    if (existingDraft.stage === "AWAITING_ITEM") {
      const itemDescription = message.textBody.trim();
      if (itemDescription.length < 3) {
        return {
          senderPhoneE164: message.senderPhoneE164,
          messageType: message.messageType,
          intent: "GUIDED_STEP",
          normalizedInput: normalizedText,
          transactionId: null,
          action: null,
          responseMessage:
            "La description est trop courte.\n\nExemple : MacBook Air M1 2020",
          allowed: false,
          rateLimitRemaining: null,
          transitionApplied: false,
          transitionDetails: {
            guided_flow_mode: existingDraft.mode,
            guided_flow_stage: existingDraft.stage,
          },
        };
      }

      const saved = await upsertGuidedDraft({
        phoneNumber: message.senderPhoneE164,
        mode: existingDraft.mode,
        stage: "AWAITING_PRICE",
        itemDescription,
        amountUsd: null,
      });
      if (!saved) {
        return {
          senderPhoneE164: message.senderPhoneE164,
          messageType: message.messageType,
          intent: "GUIDED_STEP",
          normalizedInput: normalizedText,
          transactionId: null,
          action: null,
          responseMessage:
            "⚠️ Le parcours guidé est momentanément indisponible.\n\nDites BONJOUR pour recommencer.",
          allowed: false,
          rateLimitRemaining: null,
          transitionApplied: false,
          transitionDetails: {
            guided_storage_error: true,
          },
        };
      }
      return {
        senderPhoneE164: message.senderPhoneE164,
        messageType: message.messageType,
        intent: "GUIDED_STEP",
        normalizedInput: normalizedText,
        transactionId: null,
        action: null,
        responseMessage:
          existingDraft.mode === "SELL"
            ? "Super 👍\n\nQuel est le prix en $ ?\nRépondez uniquement avec un nombre.\nExemple : 900\n\n💡 Clairtus déduit 2,5% du montant total."
            : "Super 👍\n\nQuel est le prix en $ ?\nRépondez uniquement avec un nombre.\nExemple : 900\n\n💡 En tant qu'acheteur, vous payez les frais Mobile Money opérateur.",
        allowed: true,
        rateLimitRemaining: null,
        transitionApplied: false,
        transitionDetails: {
          guided_flow_mode: existingDraft.mode,
          guided_flow_stage: "AWAITING_PRICE",
        },
      };
    }

    if (existingDraft.stage === "AWAITING_PRICE") {
      const amount = parseAmountFromInput(message.textBody);
      if (amount === null) {
        return {
          senderPhoneE164: message.senderPhoneE164,
          messageType: message.messageType,
          intent: "GUIDED_STEP",
          normalizedInput: normalizedText,
          transactionId: null,
          action: null,
          responseMessage:
            "Montant invalide.\n\nEnvoyez uniquement le prix en chiffres (de 1 à 2500).\nExemple : 900\n\nSi vous aviez interrompu la saisie, dites MENU pour recommencer.",
          allowed: false,
          rateLimitRemaining: null,
          transitionApplied: false,
          transitionDetails: {
            guided_flow_mode: existingDraft.mode,
            guided_flow_stage: existingDraft.stage,
          },
        };
      }

      const saved = await upsertGuidedDraft({
        phoneNumber: message.senderPhoneE164,
        mode: existingDraft.mode,
        stage: "AWAITING_COUNTERPARTY_PHONE",
        itemDescription: existingDraft.item_description,
        amountUsd: amount,
      });
      if (!saved) {
        return {
          senderPhoneE164: message.senderPhoneE164,
          messageType: message.messageType,
          intent: "GUIDED_STEP",
          normalizedInput: normalizedText,
          transactionId: null,
          action: null,
          responseMessage:
            "⚠️ Le parcours guidé est momentanément indisponible.\n\nDites BONJOUR pour recommencer.",
          allowed: false,
          rateLimitRemaining: null,
          transitionApplied: false,
          transitionDetails: {
            guided_storage_error: true,
          },
        };
      }

      const whoLabel = existingDraft.mode === "SELL"
        ? "numéro de l'acheteur"
        : "numéro du vendeur";
      return {
        senderPhoneE164: message.senderPhoneE164,
        messageType: message.messageType,
        intent: "GUIDED_STEP",
        normalizedInput: normalizedText,
        transactionId: null,
        action: null,
        responseMessage:
          `Parfait.\n\nEnvoyez maintenant le ${whoLabel} en format international.\nExemple : +243...\n\nLe numéro doit appartenir à la contrepartie et être valide pour Mobile Money.\nOpérateurs supportés : M-Pesa, Orange Money, Airtel Money.`,
        allowed: true,
        rateLimitRemaining: null,
        transitionApplied: false,
        transitionDetails: {
          guided_flow_mode: existingDraft.mode,
          guided_flow_stage: "AWAITING_COUNTERPARTY_PHONE",
        },
      };
    }

    if (existingDraft.stage === "AWAITING_COUNTERPARTY_PHONE") {
      const normalizedPhone = normalizeDrPhoneToE164(message.textBody);
      if (!normalizedPhone.ok) {
        return {
          senderPhoneE164: message.senderPhoneE164,
          messageType: message.messageType,
          intent: "GUIDED_STEP",
          normalizedInput: normalizedText,
          transactionId: null,
          action: null,
          responseMessage: normalizedPhone.error,
          allowed: false,
          rateLimitRemaining: null,
          transitionApplied: false,
          transitionDetails: {
            guided_flow_mode: existingDraft.mode,
            guided_flow_stage: existingDraft.stage,
          },
        };
      }

      if (!existingDraft.item_description || existingDraft.amount_usd === null) {
        await clearGuidedDraft(message.senderPhoneE164);
        return {
          senderPhoneE164: message.senderPhoneE164,
          messageType: message.messageType,
          intent: "GUIDED_STEP",
          normalizedInput: normalizedText,
          transactionId: null,
          action: null,
          responseMessage:
            "⚠️ La saisie guidée a expiré.\n\nDites BONJOUR pour recommencer.",
          allowed: false,
          rateLimitRemaining: null,
          transitionApplied: false,
          transitionDetails: {
            guided_flow_expired: true,
          },
        };
      }

      const verb = existingDraft.mode === "SELL" ? "Vente" : "Achat";
      const priceText = Number(existingDraft.amount_usd).toFixed(2);
      const syntheticCommand =
        `${verb} ${priceText} USD ${existingDraft.item_description} au ${normalizedPhone.value}`;

      await clearGuidedDraft(message.senderPhoneE164);
      return {
        senderPhoneE164: message.senderPhoneE164,
        messageType: message.messageType,
        intent: "CREATE_TRANSACTION",
        normalizedInput: "CREATE_TRANSACTION_GUIDED",
        transactionId: null,
        action: null,
        responseMessage:
          "✅ Merci.\n\nNous lançons votre transaction sécurisée.",
        allowed: true,
        rateLimitRemaining: null,
        transitionApplied: false,
        transitionDetails: {
          guided_flow_completed: true,
          guided_flow_mode: existingDraft.mode,
        },
        createTransactionMessageText: syntheticCommand,
      };
    }
  }

  if (isFrenchGreeting(message.textBody)) {
    const fullName = `${identity.firstName ?? ""} ${identity.lastName ?? ""}`.trim();
    const menuSent = await sendGuidedEntryButtons(message.senderPhoneE164, fullName || undefined);
    return {
      senderPhoneE164: message.senderPhoneE164,
      messageType: message.messageType,
      intent: "GUIDED_START",
      normalizedInput: normalizedText,
      transactionId: null,
      action: null,
      responseMessage: menuSent
        ? `✅ Bienvenue, ${fullName}.\n\nChoisissez VENDRE ou ACHETER pour continuer.`
        : "✅ Bienvenue.\n\nRépondez VENDRE ou ACHETER pour démarrer.",
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: {
        guided_menu_dispatched: menuSent,
      },
      responseDispatched: true,
    };
  }

  const intentResult = detectIntent(message);
  const base: Omit<RoutedMessage, "responseMessage" | "allowed" | "rateLimitRemaining"> = {
    senderPhoneE164: message.senderPhoneE164,
    messageType: message.messageType,
    intent: intentResult.intent,
    normalizedInput: intentResult.normalizedInput,
    transactionId: intentResult.transactionId,
    action: intentResult.action,
    transitionApplied: false,
    transitionDetails: null,
    transactionReference: intentResult.reference,
  };

  if (intentResult.intent === "CREATE_TRANSACTION") {
    await clearGuidedDraft(message.senderPhoneE164);
    const suspended = await isUserSuspended(message.senderPhoneE164);
    if (suspended) {
      return {
        ...base,
        responseMessage:
          "🚫 Votre compte est temporairement suspendu.\n\nContactez l'assistance Clairtus pour continuer.",
        allowed: false,
        rateLimitRemaining: 0,
        transitionApplied: false,
        transitionDetails: null,
      };
    }

    return {
      ...base,
      responseMessage:
        "✅ Demande reçue.\n\nNous vérifions les informations avant de lancer la transaction.",
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: null,
    };
  }

  if (intentResult.intent === "BUTTON_ACCEPT") {
    return {
      ...base,
      responseMessage:
        "✅ Confirmation reçue.\n\nNous sécurisons le paiement.",
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: null,
    };
  }

  if (intentResult.intent === "BUTTON_REJECT") {
    return {
      ...base,
      responseMessage:
        "✅ Refus enregistré.\n\nNous annulons la transaction.",
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: null,
    };
  }

  if (intentResult.intent === "HUMAN_SUPPORT") {
    return {
      ...base,
      responseMessage:
        "🆘 Demande d'assistance reçue.\n\nUn agent Clairtus prend le relais.",
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: null,
    };
  }

  if (intentResult.intent === "RETRY_PAYOUT") {
    return {
      ...base,
      responseMessage:
        "🔁 Demande reçue.\n\nNous relançons le transfert vendeur.",
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: null,
    };
  }

  if (intentResult.intent === "SUBMIT_PIN") {
    return {
      ...base,
      responseMessage: "🔐 Code PIN reçu.\n\nVérification en cours.",
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: null,
    };
  }

  if (intentResult.intent === "LIST_TRANSACTIONS") {
    const rows = await listUserTransactions(message.senderPhoneE164);
    return {
      ...base,
      responseMessage: buildTransactionsListMessage(message.senderPhoneE164, rows),
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: {
        listed_transactions_count: rows.length,
      },
    };
  }

  if (intentResult.intent === "DETAIL_TRANSACTION") {
    const reference = intentResult.reference;
    if (!reference) {
      return {
        ...base,
        responseMessage:
          "Référence manquante.\n\nUtilisez : DETAIL CLT-XXXXXX",
        allowed: false,
        rateLimitRemaining: null,
        transitionApplied: false,
        transitionDetails: null,
      };
    }

    const row = await getTransactionByReferenceForUser(message.senderPhoneE164, reference);
    if (!row) {
      return {
        ...base,
        responseMessage:
          "Transaction introuvable pour cette référence.\n\nEnvoyez MES TRANSACTIONS pour voir la liste.",
        allowed: false,
        rateLimitRemaining: null,
        transitionApplied: false,
        transitionDetails: {
          requested_reference: reference,
        },
      };
    }

    return {
      ...base,
      responseMessage: buildTransactionDetailMessage(message.senderPhoneE164, row),
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: {
        requested_reference: reference,
        resolved_transaction_id: row.id,
      },
    };
  }

  if (intentResult.intent === "CANCEL_TRANSACTION") {
    return {
      ...base,
      responseMessage:
        "🛑 Demande d'annulation reçue.\n\nNous vérifions si la transaction peut encore être annulée.",
      allowed: true,
      rateLimitRemaining: null,
      transitionApplied: false,
      transitionDetails: null,
    };
  }

  const activeTx = await getLatestActiveTransactionForUser(message.senderPhoneE164);
  const latestStatus = await getLatestTransactionStatusForUser(message.senderPhoneE164);
  return {
    ...base,
    responseMessage: buildRoleAwareFallbackMessage(
      message.senderPhoneE164,
      activeTx,
      latestStatus,
    ),
    allowed: false,
    rateLimitRemaining: null,
    transitionApplied: false,
    transitionDetails: {
      active_context_status: activeTx?.status ?? null,
      latest_transaction_status: latestStatus,
    },
  };
}

function isAutoPaymentBypassEnabled(): boolean {
  const raw = (Deno.env.get("AUTO_MARK_PAYMENT_SECURED") ?? "false").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

async function autoSecureTransactionForTesting(input: {
  transactionId: string;
  buyerPhone: string;
  sellerPhone: string;
  baseAmount: number;
  existingPin: string | null;
}): Promise<Record<string, unknown>> {
  const supabase = createServiceRoleClient();
  const pin = input.existingPin ?? generateSecure4DigitPin();
  const expiresAt72h = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      status: "SECURED",
      secret_pin: pin,
      pin_attempts: 0,
      expires_at: expiresAt72h,
    })
    .eq("id", input.transactionId)
    .eq("status", "PENDING_FUNDING");

  if (updateError) {
    throw new Error(`Auto-secure transition failed: ${updateError.message}`);
  }

  await supabase.from("transaction_status_log").insert({
    transaction_id: input.transactionId,
    old_status: "PENDING_FUNDING",
    new_status: "SECURED",
    event: "DEPOSIT_CONFIRMED",
    reason: "Auto-secured in test mode after ACCEPTER",
    changed_by: "WHATSAPP_WEBHOOK",
  });

  const buyerNotice = await sendWhatsAppTextMessage({
    recipientPhoneE164: input.buyerPhone,
    transactionId: input.transactionId,
    messageText:
      `🔐 Paiement confirmé (mode test).\n\nVoici votre code PIN de livraison : ${pin}\n\n⚠️ Ne partagez ce code qu'au moment de la remise de l'article.`,
  });
  const sellerNotice = await sendWhatsAppTextMessage({
    recipientPhoneE164: input.sellerPhone,
    transactionId: input.transactionId,
    messageText:
      `✅ Paiement confirmé (mode test).\n\nFonds sécurisés : ${input.baseAmount.toFixed(2)} USD.\n\nDemandez le code PIN client puis envoyez-le ici pour lancer le transfert.`,
  });

  return {
    transaction_id: input.transactionId,
    payment_mode: "AUTO_BYPASS",
    simulated_payment: true,
    secured: true,
    generated_pin: pin,
    buyer_message_sent: buyerNotice.sent,
    seller_message_sent: sellerNotice.sent,
  };
}

async function applyInteractiveAction(
  message: RoutedMessage,
): Promise<RoutedMessage> {
  if (
    message.intent !== "BUTTON_ACCEPT" &&
    message.intent !== "BUTTON_REJECT" &&
    message.intent !== "CANCEL_TRANSACTION" &&
    message.intent !== "RETRY_PAYOUT" &&
    message.intent !== "HUMAN_SUPPORT" &&
    message.intent !== "SUBMIT_PIN"
  ) {
    return message;
  }

  let resolvedTransactionId = message.transactionId;
  if (!resolvedTransactionId && message.intent === "HUMAN_SUPPORT") {
    const supabase = createServiceRoleClient();
    const { data: activeTransaction } = await supabase
      .from("transactions")
      .select("id")
      .or(
        `seller_phone.eq.${message.senderPhoneE164},buyer_phone.eq.${message.senderPhoneE164}`,
      )
      .in(
        "status",
        [
          "INITIATED",
          "PENDING_FUNDING",
          "SECURED",
          "PAYOUT_FAILED",
          "PAYOUT_DELAYED",
          "PIN_FAILED_LOCKED",
        ],
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeTransaction) {
      resolvedTransactionId = (activeTransaction as { id: string }).id;
    }
  }

  if (!resolvedTransactionId && message.intent === "CANCEL_TRANSACTION") {
    const supabase = createServiceRoleClient();
    const { data: activeTransaction } = await supabase
      .from("transactions")
      .select("id")
      .or(
        `seller_phone.eq.${message.senderPhoneE164},buyer_phone.eq.${message.senderPhoneE164}`,
      )
      .in("status", ["INITIATED", "PENDING_FUNDING"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeTransaction) {
      resolvedTransactionId = (activeTransaction as { id: string }).id;
    }
  }

  if (!resolvedTransactionId && message.intent === "SUBMIT_PIN") {
    const supabase = createServiceRoleClient();
    const { data: activeTransaction } = await supabase
      .from("transactions")
      .select("id")
      .eq("seller_phone", message.senderPhoneE164)
      .eq("status", "SECURED")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeTransaction) {
      resolvedTransactionId = (activeTransaction as { id: string }).id;
    }
  }

  if (!resolvedTransactionId) {
    return {
      ...message,
      allowed: false,
      responseMessage:
        message.intent === "HUMAN_SUPPORT"
          ? "Aucune transaction active trouvée pour contacter l'assistance."
          : message.intent === "SUBMIT_PIN"
          ? "Aucune transaction sécurisée trouvée pour ce code PIN."
          : message.intent === "CANCEL_TRANSACTION"
          ? "Aucune transaction annulable trouvée.\n\nVous ne pouvez annuler qu'avant la confirmation du paiement."
          : "Action introuvable.\n\nRelancez depuis le dernier message Clairtus.",
    };
  }

  const supabase = createServiceRoleClient();
  const { data: transaction, error: readError } = await supabase
    .from("transactions")
    .select("id, status, seller_phone, buyer_phone, requires_human, base_amount, secret_pin")
    .eq("id", resolvedTransactionId)
    .maybeSingle();

  if (readError || !transaction) {
    return {
      ...message,
      allowed: false,
      responseMessage: "Transaction introuvable ou inaccessible.",
    };
  }

  const transactionRow = transaction as {
    id: string;
    status: string;
    seller_phone: string;
    buyer_phone: string;
    requires_human: boolean;
    base_amount: number;
    secret_pin: string | null;
  };

  if (
    transactionRow.requires_human &&
    message.intent !== "HUMAN_SUPPORT" &&
    message.intent !== "CANCEL_TRANSACTION"
  ) {
    return {
      ...message,
      allowed: false,
      responseMessage:
        "🆘 Assistance activée.\n\nUn agent Clairtus vous contactera sous 2 heures.",
      transitionApplied: false,
      transitionDetails: {
        transaction_id: transactionRow.id,
        requires_human: true,
        automation_halted: true,
      },
    };
  }

  if (
    message.senderPhoneE164 !== transactionRow.seller_phone &&
    message.senderPhoneE164 !== transactionRow.buyer_phone
  ) {
    return {
      ...message,
      allowed: false,
      responseMessage: "Cette action n'est pas autorisée pour votre numéro.",
    };
  }

  if (message.intent === "HUMAN_SUPPORT") {
    const { error: supportError } = await supabase
      .from("transactions")
      .update({ requires_human: true })
      .eq("id", transactionRow.id);
    if (supportError) {
      return {
        ...message,
        allowed: false,
        responseMessage: "Impossible d'ouvrir l'assistance pour le moment.\n\nRéessayez dans un instant.",
      };
    }

    const acknowledgement =
      "🆘 Demande d'assistance enregistrée.\n\nUn agent Clairtus vous contactera sous 2 heures.";
    await sendWhatsAppTextMessage({
      recipientPhoneE164: message.senderPhoneE164,
      transactionId: transactionRow.id,
      messageText: acknowledgement,
    });

    await supabase.from("transaction_status_log").insert({
      transaction_id: transactionRow.id,
      old_status: transactionRow.status,
      new_status: transactionRow.status,
      event: "HUMAN_SUPPORT_REQUESTED",
      reason: "User requested human assistance via AIDE/Help/Support",
      changed_by: "WHATSAPP_WEBHOOK",
    });

    await supabase.from("error_logs").insert({
      transaction_id: transactionRow.id,
      error_type: "ADMIN_ALERT_HUMAN_SUPPORT_REQUESTED",
      error_message: "Human support requested; automation halted for transaction.",
      error_details: {
        component: "whatsapp-webhook",
        transaction_id: transactionRow.id,
        sender_phone: message.senderPhoneE164,
        source_intent: message.intent,
        normalized_input: message.normalizedInput,
        requires_human: true,
      },
    });

    return {
      ...message,
      transitionApplied: true,
      transitionDetails: {
        transaction_id: transactionRow.id,
        requires_human: true,
        automation_halted: true,
        admin_alerted: true,
      },
      responseMessage: acknowledgement,
      responseDispatched: true,
    };
  }

  if (message.intent === "CANCEL_TRANSACTION") {
    if (!["INITIATED", "PENDING_FUNDING"].includes(transactionRow.status)) {
      return {
        ...message,
        allowed: false,
        responseMessage:
          "Annulation impossible.\n\nLe paiement est déjà confirmé ou la transaction est déjà finalisée.",
      };
    }

    const oldStatus = transactionRow.status;
    const { data: cancelled, error: cancelError } = await supabase
      .from("transactions")
      .update({ status: "CANCELLED" })
      .eq("id", transactionRow.id)
      .eq("status", oldStatus)
      .select("id")
      .maybeSingle();

    if (cancelError || !cancelled) {
      return {
        ...message,
        allowed: false,
        responseMessage:
          "⚠️ L'annulation a échoué pour le moment.\n\nRéessayez dans un instant.",
      };
    }

    await supabase.from("transaction_status_log").insert({
      transaction_id: transactionRow.id,
      old_status: oldStatus,
      new_status: "CANCELLED",
      event: "CANCEL_REQUESTED",
      reason: "User cancelled transaction before payment confirmation",
      changed_by: "WHATSAPP_WEBHOOK",
    });

    const counterpartyPhone = message.senderPhoneE164 === transactionRow.seller_phone
      ? transactionRow.buyer_phone
      : transactionRow.seller_phone;
    await sendWhatsAppTextMessage({
      recipientPhoneE164: counterpartyPhone,
      transactionId: transactionRow.id,
      messageText:
        "ℹ️ La contrepartie a annulé la transaction avant confirmation du paiement.",
    });

    return {
      ...message,
      allowed: true,
      transitionApplied: true,
      transitionDetails: {
        transaction_id: transactionRow.id,
        old_status: oldStatus,
        new_status: "CANCELLED",
        cancelled_by: message.senderPhoneE164,
      },
      responseMessage:
        "✅ Transaction annulée.\n\nVotre contrepartie a été notifiée immédiatement.",
    };
  }

  if (message.intent === "RETRY_PAYOUT") {
    if (message.senderPhoneE164 !== transactionRow.seller_phone) {
      return {
        ...message,
        allowed: false,
        responseMessage:
          "Seul le vendeur peut relancer le transfert sur cette transaction.",
      };
    }

    const payoutResult = await initiatePayoutForTransaction(transactionRow.id);
    return {
      ...message,
      transitionApplied: true,
      transitionDetails: {
        transaction_id: transactionRow.id,
        payout_result: payoutResult,
      },
      responseMessage:
        "✅ Relance enregistrée.\n\nNous vous informerons dès qu'il y a une mise à jour.",
    };
  }

  if (message.intent === "SUBMIT_PIN") {
    const stateMachineInvokeKey = Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!stateMachineInvokeKey || !supabaseUrl) {
      return {
        ...message,
        allowed: false,
        responseMessage:
          "⚠️ Validation PIN indisponible pour le moment.\n\nMerci de réessayer dans quelques instants.",
      };
    }

    const endpoint = `${supabaseUrl}/functions/v1/state-machine`;
    const submittedPin = message.normalizedInput.replace(/\s+/g, "");
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stateMachineInvokeKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "validate_pin",
          transaction_id: resolvedTransactionId,
          submitted_pin: submittedPin,
        }),
      });
    } catch (error) {
      await supabase.from("error_logs").insert({
        transaction_id: resolvedTransactionId,
        error_type: "PIN_VALIDATION_CALL_FAILED",
        error_message: error instanceof Error ? error.message : "Unknown fetch error",
        error_details: {
          component: "whatsapp-webhook",
          endpoint,
          sender_phone: message.senderPhoneE164,
        },
      });
      return {
        ...message,
        allowed: false,
        responseMessage:
          "Impossible de valider le code PIN pour le moment.\n\nRéessayez dans un instant.",
      };
    }

    const rawBody = await response.text();
    let parsedBody: Record<string, unknown> | null = null;
    try {
      parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      parsedBody = null;
    }

    if (!response.ok || parsedBody?.ok !== true) {
      await supabase.from("error_logs").insert({
        transaction_id: resolvedTransactionId,
        error_type: "PIN_VALIDATION_FAILED",
        error_message: `State machine validate_pin failed with status ${response.status}`,
        error_details: {
          component: "whatsapp-webhook",
          endpoint,
          sender_phone: message.senderPhoneE164,
          response_status: response.status,
          response_body: rawBody,
        },
      });
      return {
        ...message,
        allowed: false,
        responseMessage:
          (parsedBody?.error as string | undefined) ??
          "Code PIN invalide ou non traitable pour cette transaction.",
        transitionApplied: false,
      };
    }

    const pinResult = (parsedBody?.result ?? null) as Record<string, unknown> | null;
    const payoutResult = (parsedBody?.payout ?? null) as Record<string, unknown> | null;
    const completedInline = payoutResult?.auto_completed === true ||
      payoutResult?.completion_source === "TEST_MODE_PIN_VALIDATION";
    const pinMessage = typeof pinResult?.message === "string"
      ? pinResult.message
      : "✅ Code PIN traité.";

    return {
      ...message,
      allowed: true,
      transitionApplied: true,
      transitionDetails: {
        transaction_id: resolvedTransactionId,
        pin_result: pinResult,
        payout_result: payoutResult,
      },
      responseMessage: pinMessage,
      responseDispatched: completedInline,
    };
  }

  if (message.intent === "BUTTON_ACCEPT" && transactionRow.status === "PENDING_FUNDING") {
    if (isAutoPaymentBypassEnabled()) {
      try {
        const simulatedDeposit = await autoSecureTransactionForTesting({
          transactionId: transactionRow.id,
          buyerPhone: transactionRow.buyer_phone,
          sellerPhone: transactionRow.seller_phone,
          baseAmount: transactionRow.base_amount,
          existingPin: transactionRow.secret_pin,
        });
        return {
          ...message,
          allowed: true,
          transitionApplied: true,
          transitionDetails: {
            transaction_id: transactionRow.id,
            already_pending_funding: true,
            deposit_initiation: simulatedDeposit,
          },
          responseMessage:
            "✅ Transaction sécurisée automatiquement (mode test).\n\nVous pouvez continuer avec le code PIN.",
        };
      } catch (error) {
        await supabase.from("error_logs").insert({
          transaction_id: transactionRow.id,
          error_type: "AUTO_SECURE_FROM_PENDING_FAILED",
          error_message: error instanceof Error ? error.message : "Unknown error",
          error_details: {
            component: "whatsapp-webhook",
            intent: message.intent,
            sender_phone: message.senderPhoneE164,
            transaction_status: transactionRow.status,
          },
        });
        return {
          ...message,
          allowed: false,
          transitionApplied: false,
          responseMessage:
            "⚠️ Mode test actif, mais la sécurisation automatique a échoué.\n\nRéessayez dans un instant.",
        };
      }
    }

    try {
      const depositInitiation = await initiateDepositForTransaction(transactionRow.id);
      return {
        ...message,
        allowed: true,
        transitionApplied: false,
        transitionDetails: {
          transaction_id: transactionRow.id,
          already_pending_funding: true,
          deposit_initiation: depositInitiation,
        },
        responseMessage:
          "Cette transaction est déjà en attente de paiement.\n\nDemandez à l'acheteur de valider la demande Mobile Money.",
      };
    } catch (error) {
      await supabase.from("error_logs").insert({
        transaction_id: transactionRow.id,
        error_type: "DEPOSIT_RETRY_FROM_PENDING_FAILED",
        error_message: error instanceof Error ? error.message : "Unknown error",
        error_details: {
          component: "whatsapp-webhook",
          intent: message.intent,
          sender_phone: message.senderPhoneE164,
          transaction_status: transactionRow.status,
        },
      });
      return {
        ...message,
        allowed: false,
        transitionApplied: false,
        responseMessage:
          "La transaction est en attente, mais la relance du paiement a échoué.\n\nRéessayez dans un instant.",
      };
    }
  }

  const targetStatus = message.intent === "BUTTON_ACCEPT"
    ? "PENDING_FUNDING"
    : "CANCELLED";
  const requiredCurrentStatus = "INITIATED";

  if (transactionRow.status !== requiredCurrentStatus) {
    return {
      ...message,
      allowed: false,
      responseMessage:
        "Action impossible pour le moment.\n\nCette transaction a déjà été traitée.",
    };
  }

  const { error: transitionError } = await supabase
    .from("transactions")
    .update({ status: targetStatus })
    .eq("id", transactionRow.id)
    .eq("status", requiredCurrentStatus);

  if (transitionError) {
    return {
      ...message,
      allowed: false,
      responseMessage: "⚠️ Échec de transition.\n\nRéessayez dans un instant.",
    };
  }

  await supabase.from("transaction_status_log").insert({
    transaction_id: transactionRow.id,
    old_status: requiredCurrentStatus,
    new_status: targetStatus,
    event: message.intent === "BUTTON_ACCEPT"
      ? "COUNTERPARTY_ACCEPT"
      : "COUNTERPARTY_REJECT",
    reason: "Interactive button response",
    changed_by: "WHATSAPP_WEBHOOK",
  });

  let depositInitiation: Record<string, unknown> | null = null;
  let depositInitiationErrorMessage: string | null = null;
  if (message.intent === "BUTTON_ACCEPT") {
    try {
      if (isAutoPaymentBypassEnabled()) {
        depositInitiation = await autoSecureTransactionForTesting({
          transactionId: transactionRow.id,
          buyerPhone: transactionRow.buyer_phone,
          sellerPhone: transactionRow.seller_phone,
          baseAmount: transactionRow.base_amount,
          existingPin: transactionRow.secret_pin,
        });
      } else {
        depositInitiation = await initiateDepositForTransaction(transactionRow.id);
      }
    } catch (error) {
      depositInitiationErrorMessage = error instanceof Error ? error.message : "Unknown error";
      await supabase.from("error_logs").insert({
        transaction_id: transactionRow.id,
        error_type: "DEPOSIT_INITIATION_FAILED",
        error_message: depositInitiationErrorMessage,
        error_details: {
          component: "whatsapp-webhook",
          intent: message.intent,
        },
      });
    }
  }

  let buyerFollowupSent: boolean | null = null;
  let sellerFollowupSent: boolean | null = null;
  if (message.intent === "BUTTON_ACCEPT") {
    const checkoutUrl = typeof depositInitiation?.checkout_url === "string"
      ? depositInitiation.checkout_url
      : null;
    const autoBypass = depositInitiation?.payment_mode === "AUTO_BYPASS";
    const buyerMessageSentByDepositFlow = depositInitiation?.buyer_message_sent === true;

    if (autoBypass) {
      buyerFollowupSent = depositInitiation?.buyer_message_sent === true;
      sellerFollowupSent = depositInitiation?.seller_message_sent === true;
    } else if (depositInitiationErrorMessage) {
      const buyerFollowup = await sendWhatsAppTextMessage({
        recipientPhoneE164: transactionRow.buyer_phone,
        transactionId: transactionRow.id,
        messageText:
          "⚠️ Paiement indisponible pour le moment sur ce numéro / cette configuration.\n\nContactez l'assistance Clairtus pour activer un pays ou fournisseur compatible.",
      });
      buyerFollowupSent = buyerFollowup.sent;
    } else if (!buyerMessageSentByDepositFlow) {
      // Deposit flow sends the checkout link when available; send a fallback acknowledgement otherwise.
      const buyerFollowup = await sendWhatsAppTextMessage({
        recipientPhoneE164: transactionRow.buyer_phone,
        transactionId: transactionRow.id,
        messageText: checkoutUrl
          ? `✅ Confirmation enregistrée.\n\nOuvrez ce lien pour sécuriser le paiement :\n${checkoutUrl}\n\n💡 Les frais Mobile Money opérateur restent à la charge de l'acheteur.`
          : "✅ Confirmation enregistrée.\n\nValidez maintenant la demande Mobile Money sur votre téléphone.\n\n💡 Les frais Mobile Money opérateur restent à la charge de l'acheteur.",
      });
      buyerFollowupSent = buyerFollowup.sent;
    } else {
      buyerFollowupSent = true;
    }

    const sellerFollowup = await sendWhatsAppTextMessage({
      recipientPhoneE164: transactionRow.seller_phone,
      transactionId: transactionRow.id,
      messageText: autoBypass
        ? "✅ Mode test activé.\n\nLe paiement est marqué comme réussi automatiquement.\nVous pouvez continuer avec le code PIN."
        : depositInitiationErrorMessage
        ? "⚠️ La contrepartie a accepté, mais l'initiation du paiement a échoué.\n\nVérifiez la configuration pawaPay / pays."
        : "✅ La contrepartie a accepté.\n\nNous attendons maintenant la confirmation du paiement Mobile Money.",
    });
    sellerFollowupSent = autoBypass ? sellerFollowupSent : sellerFollowup.sent;

    if (!autoBypass) {
      try {
        await sendInteractiveButtonsMessage({
          recipientPhoneE164: transactionRow.seller_phone,
          bodyText: "Avant confirmation du paiement, vous pouvez :",
          buttons: buildPrePaymentManagementButtons(transactionRow.id),
        });
      } catch {
        // do not block primary flow
      }
      try {
        await sendInteractiveButtonsMessage({
          recipientPhoneE164: transactionRow.buyer_phone,
          bodyText: "Avant confirmation du paiement, vous pouvez :",
          buttons: buildPrePaymentManagementButtons(transactionRow.id),
        });
      } catch {
        // do not block primary flow
      }
    }
  } else if (message.intent === "BUTTON_REJECT") {
    const sellerFollowup = await sendWhatsAppTextMessage({
      recipientPhoneE164: transactionRow.seller_phone,
      transactionId: transactionRow.id,
      messageText: "❌ La contrepartie a refusé.\n\nLa transaction est annulée.",
    });
    sellerFollowupSent = sellerFollowup.sent;
  }

  return {
    ...message,
    transitionApplied: true,
    transitionDetails: {
      transaction_id: transactionRow.id,
      old_status: requiredCurrentStatus,
      new_status: targetStatus,
      deposit_initiation: depositInitiation,
      deposit_initiation_error: depositInitiationErrorMessage,
      buyer_followup_sent: buyerFollowupSent,
      seller_followup_sent: sellerFollowupSent,
    },
    responseMessage: message.intent === "BUTTON_ACCEPT"
      ? (depositInitiation?.payment_mode === "AUTO_BYPASS"
        ? "✅ Action ACCEPTER appliquée.\n\nPaiement marqué comme réussi automatiquement (mode test).\nTransaction sécurisée."
        : depositInitiationErrorMessage
        ? "⚠️ Action ACCEPTER appliquée, mais l'initiation du paiement a échoué.\n\nContactez l'assistance pour activer un fournisseur/pays compatible."
        : "✅ Action ACCEPTER appliquée.\n\nTransaction en attente de financement.")
      : "✅ Action REFUSER appliquée.\n\nTransaction annulée.",
  };
}

async function triggerCreateTransaction(
  message: RoutedMessage,
  originalTextBody: string,
): Promise<RoutedMessage> {
  if (message.intent !== "CREATE_TRANSACTION" || !message.allowed) {
    return message;
  }
  const messageTextForCreation = message.createTransactionMessageText ?? originalTextBody;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const stateMachineInvokeKey = Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !stateMachineInvokeKey) {
    const missingConfigMessage =
      "⚠️ Service temporairement indisponible.\n\nMerci de réessayer dans quelques instants.";
    const senderAck = await sendWhatsAppTextMessage({
      recipientPhoneE164: message.senderPhoneE164,
      messageText: missingConfigMessage,
    });
    return {
      ...message,
      allowed: false,
      responseMessage: missingConfigMessage,
      transitionApplied: false,
      transitionDetails: {
        component: "whatsapp-webhook",
        step: "trigger_create_transaction",
        reason: "missing_runtime_env",
        sender_ack_sent: senderAck.sent,
        sender_ack_status: senderAck.status,
      },
      responseDispatched: true,
    };
  }

  const endpoint = `${supabaseUrl}/functions/v1/state-machine`;
  const payload = {
    action: "create_transaction",
    sender_phone: message.senderPhoneE164,
    message_text: messageTextForCreation,
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stateMachineInvokeKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const supabase = createServiceRoleClient();
    await supabase.from("error_logs").insert({
      error_type: "WHATSAPP_CREATE_TRANSACTION_CALL_FAILED",
      error_message: error instanceof Error ? error.message : "Unknown fetch error",
      error_details: {
        component: "whatsapp-webhook",
        endpoint,
        sender_phone: message.senderPhoneE164,
      },
    });
    const fetchFailureMessage =
      "⚠️ Erreur temporaire lors de la création de la transaction.\n\nRéessayez dans un instant.";
    const senderAck = await sendWhatsAppTextMessage({
      recipientPhoneE164: message.senderPhoneE164,
      messageText: fetchFailureMessage,
    });
    return {
      ...message,
      allowed: false,
      responseMessage: fetchFailureMessage,
      transitionApplied: false,
      transitionDetails: {
        component: "whatsapp-webhook",
        step: "trigger_create_transaction",
        reason: "fetch_failed",
        sender_ack_sent: senderAck.sent,
        sender_ack_status: senderAck.status,
      },
      responseDispatched: true,
    };
  }

  const rawBody = await response.text();
  let parsedBody: StateMachineCreateTransactionResponse | null = null;
  try {
    parsedBody = JSON.parse(rawBody) as StateMachineCreateTransactionResponse;
  } catch {
    parsedBody = null;
  }

  if (!response.ok || !parsedBody?.ok) {
    const supabase = createServiceRoleClient();
    await supabase.from("error_logs").insert({
      error_type: "WHATSAPP_CREATE_TRANSACTION_FAILED",
      error_message: `State machine create_transaction failed with status ${response.status}`,
      error_details: {
        component: "whatsapp-webhook",
        endpoint,
        sender_phone: message.senderPhoneE164,
        response_status: response.status,
        response_body: rawBody,
      },
    });
    const creationFailedMessage =
      parsedBody?.error ??
      "La création de transaction a échoué. Vérifiez le format et réessayez.";
    const senderAck = await sendWhatsAppTextMessage({
      recipientPhoneE164: message.senderPhoneE164,
      messageText: creationFailedMessage,
    });
    return {
      ...message,
      allowed: false,
      responseMessage: creationFailedMessage,
      transitionApplied: false,
      transitionDetails: {
        component: "whatsapp-webhook",
        step: "trigger_create_transaction",
        response_status: response.status,
        sender_ack_sent: senderAck.sent,
        sender_ack_status: senderAck.status,
      },
      responseDispatched: true,
    };
  }

  const tx = parsedBody.transaction?.transaction;
  const dispatch = parsedBody.transaction?.interactive_button_dispatch;
  const dispatchSucceeded = dispatch?.sent === true;
  const successMessage = dispatchSucceeded
    ? (tx?.id
      ? "✅ Transaction créée.\n\nLa contrepartie a bien été notifiée."
      : "✅ Transaction créée.\n\nLa contrepartie a bien été notifiée.")
    : (tx?.id
      ? "⚠️ Transaction créée, mais la notification à la contrepartie a échoué.\n\nDemandez-lui d'envoyer d'abord un message à ce numéro, puis réessayez."
      : "⚠️ Transaction créée, mais la notification à la contrepartie a échoué.\n\nDemandez-lui d'envoyer d'abord un message à ce numéro, puis réessayez.");

  if (!dispatchSucceeded) {
    const supabase = createServiceRoleClient();
    await supabase.from("error_logs").insert({
      transaction_id: tx?.id ?? null,
      error_type: "WHATSAPP_COUNTERPARTY_NOTIFY_FAILED",
      error_message: "Counterparty interactive dispatch failed after transaction creation.",
      error_details: {
        component: "whatsapp-webhook",
        transaction_id: tx?.id ?? null,
        interactive_dispatch_sent: dispatch?.sent ?? null,
        interactive_dispatch_status: dispatch?.response_status ?? null,
      },
    });
  }

  const senderAck = await sendWhatsAppTextMessage({
    recipientPhoneE164: message.senderPhoneE164,
    messageText: successMessage,
    transactionId: tx?.id,
  });

  let senderPrePaymentManageSent: boolean | null = null;
  if (tx?.id && tx?.status === "INITIATED") {
    try {
      const senderManageDispatch = await sendInteractiveButtonsMessage({
        recipientPhoneE164: message.senderPhoneE164,
        bodyText:
          "Actions disponibles tant que le paiement n'est pas confirmé :",
        buttons: buildPrePaymentManagementButtons(tx.id),
      });
      senderPrePaymentManageSent = senderManageDispatch.sent;
    } catch {
      senderPrePaymentManageSent = false;
    }
  }

  return {
    ...message,
    transitionApplied: true,
    transitionDetails: {
      component: "whatsapp-webhook",
      step: "trigger_create_transaction",
      transaction_id: tx?.id ?? null,
      transaction_status: tx?.status ?? null,
      seller_phone: tx?.seller_phone ?? null,
      buyer_phone: tx?.buyer_phone ?? null,
      interactive_dispatch_sent: dispatch?.sent ?? null,
      interactive_dispatch_status: dispatch?.response_status ?? null,
      sender_ack_sent: senderAck.sent,
      sender_ack_status: senderAck.status,
      sender_prepayment_manage_sent: senderPrePaymentManageSent,
    },
    responseMessage: successMessage,
    responseDispatched: true,
  };
}

async function dispatchResponseMessageIfNeeded(
  message: RoutedMessage,
): Promise<RoutedMessage> {
  if (message.responseDispatched === true || !message.responseMessage) {
    return message;
  }

  const sendResult = await sendWhatsAppTextMessage({
    recipientPhoneE164: message.senderPhoneE164,
    messageText: message.responseMessage,
    transactionId: message.transactionId ?? undefined,
  });

  return {
    ...message,
    responseDispatched: true,
    transitionDetails: {
      ...(message.transitionDetails ?? {}),
      sender_ack_sent: sendResult.sent,
      sender_ack_status: sendResult.status,
    },
  };
}

function isRoutingTraceEnabled(): boolean {
  const raw = (Deno.env.get("ENABLE_ROUTING_TRACE_LOGS") ?? "false").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

function buildRoutingTraceTag(message: RoutedMessage): string {
  const intent = message.intent;
  const allowed = message.allowed ? "ALLOWED" : "BLOCKED";
  const transitioned = message.transitionApplied ? "TRANSITIONED" : "NO_TRANSITION";
  const dispatched = message.responseDispatched ? "RESPONDED" : "NO_RESPONSE";
  return `${intent}|${allowed}|${transitioned}|${dispatched}`;
}

async function maybeLogRoutingTrace(input: {
  routedMessage: RoutedMessage;
  parsedMessage: ParsedIncomingMessage;
}): Promise<void> {
  if (!isRoutingTraceEnabled()) {
    return;
  }

  try {
    const supabase = createServiceRoleClient();
    const traceTag = buildRoutingTraceTag(input.routedMessage);
    await supabase.from("error_logs").insert({
      transaction_id: input.routedMessage.transactionId ?? null,
      error_type: "ROUTING_TRACE",
      error_message: traceTag,
      error_details: {
        component: "whatsapp-webhook",
        sender_phone: input.routedMessage.senderPhoneE164,
        message_type: input.parsedMessage.messageType,
        original_text: input.parsedMessage.textBody,
        button_payload: input.parsedMessage.buttonPayload,
        intent: input.routedMessage.intent,
        allowed: input.routedMessage.allowed,
        transition_applied: input.routedMessage.transitionApplied,
        response_dispatched: input.routedMessage.responseDispatched ?? false,
        transition_details: input.routedMessage.transitionDetails,
      },
    });
  } catch {
    // Never block routing on trace logging.
  }
}

function withRoutingTrace(
  routedMessage: RoutedMessage,
): RoutedMessage {
  const traceTag = buildRoutingTraceTag(routedMessage);
  return {
    ...routedMessage,
    transitionDetails: {
      ...(routedMessage.transitionDetails ?? {}),
      routing_trace_tag: traceTag,
    },
  };
}

serve(async (request: Request): Promise<Response> => {
  try {
    if (request.method !== "GET" && request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (request.method === "GET") {
      const verifyToken = Deno.env.get("META_VERIFY_TOKEN");
      if (!verifyToken) {
        return jsonResponse(
          { error: "Server configuration missing META_VERIFY_TOKEN" },
          500,
        );
      }

      const url = new URL(request.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (!mode || !token || !challenge) {
        return jsonResponse(
          { error: "Missing hub.mode, hub.verify_token, or hub.challenge" },
          400,
        );
      }

      if (mode !== "subscribe") {
        return jsonResponse({ error: "Unsupported hub.mode value" }, 400);
      }

      if (token !== verifyToken) {
        return jsonResponse({ error: "Invalid verify token" }, 403);
      }

      return new Response(challenge, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appSecret) {
      return jsonResponse(
        { error: "Server configuration missing META_APP_SECRET" },
        500,
      );
    }

    const signatureHeader = request.headers.get("x-hub-signature-256");
    if (!signatureHeader) {
      await logSignatureFailure("Missing X-Hub-Signature-256 header", null);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payload = new Uint8Array(await request.arrayBuffer());
    const isValidSignature = await isMetaSignatureValid(
      payload,
      signatureHeader,
      appSecret,
    );

    if (!isValidSignature) {
      await logSignatureFailure(
        "Invalid X-Hub-Signature-256 HMAC signature",
        signatureHeader,
      );
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payloadText = new TextDecoder().decode(payload);
    let webhookPayload: MetaWebhookPayload;
    try {
      webhookPayload = JSON.parse(payloadText) as MetaWebhookPayload;
    } catch {
      return jsonResponse({ error: "Invalid JSON payload" }, 400);
    }

    const { parsedMessages, rejectedMessages } = parseIncomingMessages(webhookPayload);
    const routedMessages: RoutedMessage[] = [];
    for (const parsedMessage of parsedMessages) {
      const routed = await routeMessage(parsedMessage);
      const actionApplied = await applyInteractiveAction(routed);
      const transactionTriggered = await triggerCreateTransaction(
        actionApplied,
        parsedMessage.textBody,
      );
      const responseDispatched = await dispatchResponseMessageIfNeeded(
        transactionTriggered,
      );
      const tracedMessage = withRoutingTrace(responseDispatched);
      await maybeLogRoutingTrace({
        routedMessage: tracedMessage,
        parsedMessage,
      });
      routedMessages.push(tracedMessage);
    }

    return jsonResponse(
      {
        ok: true,
        function: "whatsapp-webhook",
        message: "Webhook signature verified, messages parsed and routed.",
        parsed_messages_count: parsedMessages.length,
        rejected_messages_count: rejectedMessages.length,
        rejected_messages: rejectedMessages,
        phone_format_error_message: PHONE_FORMAT_ERROR_MESSAGE,
        routed_messages_count: routedMessages.length,
        routed_messages: routedMessages,
      },
      200,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        function: "whatsapp-webhook",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
