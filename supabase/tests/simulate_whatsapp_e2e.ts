#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Clairtus E2E WhatsApp Bot Simulator
 * 
 * This script simulates a complete happy-path transaction flow:
 * 1. Vendor sends AI-parsed message
 * 2. Vendor confirms AI prefill
 * 3. Buyer accepts transaction
 * 4. PawaPay deposit webhook (simulated)
 * 5. Vendor submits PIN
 * 6. Transaction completes
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ============================================================================
// Configuration
// ============================================================================

const VENDOR_PHONE = "+27603960790";
const BUYER_PHONE = "+27695446706";
const TEST_AMOUNT = 50;
const TEST_ITEM = "MacBook Air M1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// Utilities
// ============================================================================

function log(emoji: string, message: string) {
  console.log(`${emoji} ${message}`);
}

function logStep(step: number, message: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`STEP ${step}: ${message}`);
  console.log("=".repeat(80));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Meta WhatsApp Webhook Payload Builders
// ============================================================================

function buildMetaTextMessagePayload(from: string, text: string): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550000000",
                phone_number_id: "PHONE_NUMBER_ID",
              },
              messages: [
                {
                  from,
                  id: `wamid.${Date.now()}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: "text",
                  text: {
                    body: text,
                  },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

function buildMetaInteractiveButtonPayload(from: string, buttonId: string, buttonTitle: string): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550000000",
                phone_number_id: "PHONE_NUMBER_ID",
              },
              messages: [
                {
                  from,
                  id: `wamid.${Date.now()}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: "interactive",
                  interactive: {
                    type: "button_reply",
                    button_reply: {
                      id: buttonId,
                      title: buttonTitle,
                    },
                  },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

// ============================================================================
// PawaPay Webhook Payload Builder
// ============================================================================

function buildPawaPayDepositSuccessPayload(transactionId: string, depositId: string): unknown {
  return {
    depositId,
    status: "COMPLETED",
    idempotencyKey: transactionId,
    correspondentIds: {
      idempotencyKey: transactionId,
    },
    metadata: {
      transactionId,
    },
  };
}

// ============================================================================
// Webhook Callers
// ============================================================================

async function postToWhatsAppWebhook(payload: unknown): Promise<{ ok: boolean; body: unknown; status: number }> {
  const endpoint = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
  const payloadString = JSON.stringify(payload);
  
  // Use E2E test bypass header instead of computing signature
  const e2eTestKey = Deno.env.get("E2E_TEST_KEY") || "clairtus_e2e_test_2026";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-e2e-test-key": e2eTestKey,
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: payloadString,
  });

  const body = await response.json();
  return { ok: response.ok, body, status: response.status };
}

async function postToPawaPayWebhook(payload: unknown): Promise<{ ok: boolean; body: unknown; status: number }> {
  const endpoint = `${SUPABASE_URL}/functions/v1/pawapay-webhook`;
  const payloadString = JSON.stringify(payload);
  
  // Use E2E test bypass header instead of computing signature
  const e2eTestKey = Deno.env.get("E2E_TEST_KEY") || "clairtus_e2e_test_2026";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-e2e-test-key": e2eTestKey,
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: payloadString,
  });

  const body = await response.json();
  return { ok: response.ok, body, status: response.status };
}

// ============================================================================
// Database Helpers
// ============================================================================

async function getLatestTransactionForUser(phone: string): Promise<{ id: string; status: string } | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, status")
    .or(`seller_phone.eq.${phone},buyer_phone.eq.${phone}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data as { id: string; status: string };
}

async function getAiDraftForUser(phone: string): Promise<{ phone_number: string; intent: string; amount_usd: number } | null> {
  const { data, error } = await supabase
    .from("ai_transaction_drafts")
    .select("phone_number, intent, amount_usd, counterparty_phone")
    .eq("phone_number", phone)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data as { phone_number: string; intent: string; amount_usd: number };
}

async function getTransactionPin(transactionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("secret_pin")
    .eq("id", transactionId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return (data as { secret_pin: string | null }).secret_pin;
}

async function cleanupTestData() {
  log("🧹", "Cleaning up previous test data...");
  
  // Delete test transactions
  await supabase
    .from("transactions")
    .delete()
    .or(`seller_phone.eq.${VENDOR_PHONE},buyer_phone.eq.${BUYER_PHONE}`);
  
  // Delete AI drafts
  await supabase
    .from("ai_transaction_drafts")
    .delete()
    .in("phone_number", [VENDOR_PHONE, BUYER_PHONE]);
  
  // Delete guided drafts
  await supabase
    .from("guided_message_drafts")
    .delete()
    .in("phone_number", [VENDOR_PHONE, BUYER_PHONE]);
  
  // Delete identity drafts
  await supabase
    .from("user_identity_drafts")
    .delete()
    .in("phone_number", [VENDOR_PHONE, BUYER_PHONE]);
  
  // Ensure users exist with identity
  await supabase
    .from("users")
    .upsert([
      { phone_number: VENDOR_PHONE, first_name: "Test", last_name: "Vendor" },
      { phone_number: BUYER_PHONE, first_name: "Test", last_name: "Buyer" },
    ], { onConflict: "phone_number" });
  
  log("✅", "Cleanup complete");
}

// ============================================================================
// Test Steps
// ============================================================================

async function step1_VendorSendsAiMessage(): Promise<void> {
  logStep(1, "Vendor sends AI-parsed transaction message");
  
  const message = `Je veux vendre ${TEST_ITEM} à ${TEST_AMOUNT}$ au ${BUYER_PHONE}`;
  log("📤", `Vendor (${VENDOR_PHONE}) sends: "${message}"`);
  
  const payload = buildMetaTextMessagePayload(VENDOR_PHONE, message);
  const result = await postToWhatsAppWebhook(payload);
  
  log("📥", `Webhook response: ${result.status} ${result.ok ? "✅" : "❌"}`);
  console.log(JSON.stringify(result.body, null, 2));
  
  if (!result.ok) {
    throw new Error(`WhatsApp webhook failed: ${JSON.stringify(result.body)}`);
  }
  
  // Wait for async processing
  await sleep(2000);
  
  // Verify AI draft was created
  const draft = await getAiDraftForUser(VENDOR_PHONE);
  if (!draft) {
    throw new Error("❌ AI draft was not created in database");
  }
  
  log("✅", `AI draft created: intent=${draft.intent}, amount=${draft.amount_usd} USD`);
}

async function step2_VendorConfirmsAiPrefill(): Promise<void> {
  logStep(2, "Vendor confirms AI prefill by clicking 'Oui, continuer'");
  
  log("📤", `Vendor (${VENDOR_PHONE}) clicks: "Oui, continuer" (AI_CONFIRM|YES)`);
  
  const payload = buildMetaInteractiveButtonPayload(VENDOR_PHONE, "AI_CONFIRM|YES", "Oui, continuer");
  const result = await postToWhatsAppWebhook(payload);
  
  log("📥", `Webhook response: ${result.status} ${result.ok ? "✅" : "❌"}`);
  console.log(JSON.stringify(result.body, null, 2));
  
  if (!result.ok) {
    throw new Error(`WhatsApp webhook failed: ${JSON.stringify(result.body)}`);
  }
  
  // Wait for async processing
  await sleep(2000);
  
  // Verify transaction was created
  const transaction = await getLatestTransactionForUser(VENDOR_PHONE);
  if (!transaction) {
    throw new Error("❌ Transaction was not created in database");
  }
  
  log("✅", `Transaction created: id=${transaction.id}, status=${transaction.status}`);
  
  if (transaction.status !== "INITIATED") {
    throw new Error(`❌ Expected status INITIATED, got ${transaction.status}`);
  }
}

async function step3_BuyerAcceptsTransaction(): Promise<void> {
  logStep(3, "Buyer accepts the transaction");
  
  const transaction = await getLatestTransactionForUser(BUYER_PHONE);
  if (!transaction) {
    throw new Error("❌ No transaction found for buyer");
  }
  
  log("📤", `Buyer (${BUYER_PHONE}) clicks: "ACCEPTER" for transaction ${transaction.id}`);
  
  const payload = buildMetaInteractiveButtonPayload(
    BUYER_PHONE,
    `TXN|${transaction.id}|ACCEPTER`,
    "ACCEPTER"
  );
  const result = await postToWhatsAppWebhook(payload);
  
  log("📥", `Webhook response: ${result.status} ${result.ok ? "✅" : "❌"}`);
  console.log(JSON.stringify(result.body, null, 2));
  
  if (!result.ok) {
    throw new Error(`WhatsApp webhook failed: ${JSON.stringify(result.body)}`);
  }
  
  // Wait for async processing
  await sleep(2000);
  
  // Verify transaction moved to PENDING_FUNDING
  const updatedTx = await getLatestTransactionForUser(BUYER_PHONE);
  if (!updatedTx) {
    throw new Error("❌ Transaction not found after acceptance");
  }
  
  log("✅", `Transaction status: ${updatedTx.status}`);
  
  if (updatedTx.status !== "PENDING_FUNDING" && updatedTx.status !== "SECURED") {
    throw new Error(`❌ Expected PENDING_FUNDING or SECURED, got ${updatedTx.status}`);
  }
}

async function step4_SimulatePawaPayDeposit(): Promise<void> {
  logStep(4, "Simulate PawaPay deposit success webhook");
  
  const transaction = await getLatestTransactionForUser(VENDOR_PHONE);
  if (!transaction) {
    throw new Error("❌ No transaction found");
  }
  
  const depositId = `dep_${Date.now()}`;
  log("📤", `Sending PawaPay deposit webhook: depositId=${depositId}, transactionId=${transaction.id}`);
  
  const payload = buildPawaPayDepositSuccessPayload(transaction.id, depositId);
  const result = await postToPawaPayWebhook(payload);
  
  log("📥", `Webhook response: ${result.status} ${result.ok ? "✅" : "❌"}`);
  console.log(JSON.stringify(result.body, null, 2));
  
  if (!result.ok) {
    throw new Error(`PawaPay webhook failed: ${JSON.stringify(result.body)}`);
  }
  
  // Wait for async processing
  await sleep(2000);
  
  // Verify transaction moved to SECURED
  const updatedTx = await getLatestTransactionForUser(VENDOR_PHONE);
  if (!updatedTx) {
    throw new Error("❌ Transaction not found after deposit");
  }
  
  log("✅", `Transaction status: ${updatedTx.status}`);
  
  if (updatedTx.status !== "SECURED") {
    throw new Error(`❌ Expected SECURED, got ${updatedTx.status}`);
  }
}

async function step5_VendorSubmitsPin(): Promise<void> {
  logStep(5, "Vendor submits PIN to complete transaction");
  
  const transaction = await getLatestTransactionForUser(VENDOR_PHONE);
  if (!transaction) {
    throw new Error("❌ No transaction found");
  }
  
  const pin = await getTransactionPin(transaction.id);
  if (!pin) {
    throw new Error("❌ No PIN found for transaction");
  }
  
  log("📤", `Vendor (${VENDOR_PHONE}) submits PIN: ${pin}`);
  
  const payload = buildMetaTextMessagePayload(VENDOR_PHONE, pin);
  const result = await postToWhatsAppWebhook(payload);
  
  log("📥", `Webhook response: ${result.status} ${result.ok ? "✅" : "❌"}`);
  console.log(JSON.stringify(result.body, null, 2));
  
  if (!result.ok) {
    throw new Error(`WhatsApp webhook failed: ${JSON.stringify(result.body)}`);
  }
  
  // Wait for async processing
  await sleep(3000);
  
  // Verify transaction completed
  const updatedTx = await getLatestTransactionForUser(VENDOR_PHONE);
  if (!updatedTx) {
    throw new Error("❌ Transaction not found after PIN submission");
  }
  
  log("✅", `Transaction status: ${updatedTx.status}`);
  
  if (updatedTx.status !== "COMPLETED") {
    throw new Error(`❌ Expected COMPLETED, got ${updatedTx.status}`);
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("🚀 CLAIRTUS E2E WHATSAPP BOT SIMULATOR");
  console.log("=".repeat(80));
  console.log(`Vendor: ${VENDOR_PHONE}`);
  console.log(`Buyer: ${BUYER_PHONE}`);
  console.log(`Amount: ${TEST_AMOUNT} USD`);
  console.log(`Item: ${TEST_ITEM}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log("=".repeat(80) + "\n");

  try {
    await cleanupTestData();
    await sleep(1000);
    
    await step1_VendorSendsAiMessage();
    await step2_VendorConfirmsAiPrefill();
    await step3_BuyerAcceptsTransaction();
    await step4_SimulatePawaPayDeposit();
    await step5_VendorSubmitsPin();
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ E2E TRANSACTION SIMULATION COMPLETED SUCCESSFULLY");
    console.log("=".repeat(80) + "\n");
    
    Deno.exit(0);
  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("❌ E2E SIMULATION FAILED");
    console.error("=".repeat(80));
    console.error(error);
    console.error("=".repeat(80) + "\n");
    
    Deno.exit(1);
  }
}

main();
