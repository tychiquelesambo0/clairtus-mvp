#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Clairtus Comprehensive E2E Test Suite
 * 
 * Tests all critical transaction flows:
 * 1. Happy Path (already tested in simulate_whatsapp_e2e.ts)
 * 2. Buyer Rejection Flow
 * 3. Seller Cancellation Flow
 * 4. PIN Failure Flow (3 attempts)
 * 5. AI Prefill Rejection Flow
 * 6. Invalid Phone Number Flow
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ============================================================================
// Configuration
// ============================================================================

const VENDOR_PHONE = "+27603960790";
const BUYER_PHONE = "+27695446706";
const INVALID_PHONE = "+1234567890"; // Non-SA, non-DRC number

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

function logTest(testName: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🧪 TEST: ${testName}`);
  console.log("=".repeat(80));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Payload Builders
// ============================================================================

function buildMetaTextMessagePayload(from: string, text: string): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "15550000000",
            phone_number_id: "PHONE_NUMBER_ID",
          },
          messages: [{
            from,
            id: `wamid.${Date.now()}`,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: "text",
            text: { body: text },
          }],
        },
        field: "messages",
      }],
    }],
  };
}

function buildMetaInteractiveButtonPayload(from: string, buttonId: string, buttonTitle: string): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "15550000000",
            phone_number_id: "PHONE_NUMBER_ID",
          },
          messages: [{
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
          }],
        },
        field: "messages",
      }],
    }],
  };
}

// ============================================================================
// Webhook Callers
// ============================================================================

async function postToWhatsAppWebhook(payload: unknown): Promise<{ ok: boolean; body: unknown; status: number }> {
  const endpoint = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
  const payloadString = JSON.stringify(payload);
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

  if (error || !data) return null;
  return data as { id: string; status: string };
}

async function getTransactionPin(transactionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("secret_pin")
    .eq("id", transactionId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { secret_pin: string | null }).secret_pin;
}

async function cleanupTestData() {
  await supabase.from("transactions").delete().or(`seller_phone.eq.${VENDOR_PHONE},buyer_phone.eq.${BUYER_PHONE}`);
  await supabase.from("ai_transaction_drafts").delete().in("phone_number", [VENDOR_PHONE, BUYER_PHONE]);
  await supabase.from("guided_message_drafts").delete().in("phone_number", [VENDOR_PHONE, BUYER_PHONE]);
  await supabase.from("user_identity_drafts").delete().in("phone_number", [VENDOR_PHONE, BUYER_PHONE]);
  
  await supabase.from("users").upsert([
    { phone_number: VENDOR_PHONE, first_name: "Test", last_name: "Vendor" },
    { phone_number: BUYER_PHONE, first_name: "Test", last_name: "Buyer" },
  ], { onConflict: "phone_number" });
}

// ============================================================================
// Test Cases
// ============================================================================

async function test_BuyerRejectsTransaction(): Promise<boolean> {
  logTest("Buyer Rejects Transaction");
  
  try {
    await cleanupTestData();
    await sleep(1000);
    
    // Step 1: Vendor creates transaction via AI
    log("📤", "Vendor sends AI message");
    const aiMessage = buildMetaTextMessagePayload(VENDOR_PHONE, "Je veux vendre iPhone 14 à 100$ au +27695446706");
    await postToWhatsAppWebhook(aiMessage);
    await sleep(2000);
    
    // Step 2: Vendor confirms AI prefill
    log("📤", "Vendor confirms AI prefill");
    const confirmPayload = buildMetaInteractiveButtonPayload(VENDOR_PHONE, "AI_CONFIRM|YES", "Oui, continuer");
    await postToWhatsAppWebhook(confirmPayload);
    await sleep(2000);
    
    const transaction = await getLatestTransactionForUser(BUYER_PHONE);
    if (!transaction || transaction.status !== "INITIATED") {
      throw new Error(`Expected INITIATED, got ${transaction?.status}`);
    }
    
    // Step 3: Buyer REJECTS transaction
    log("📤", "Buyer clicks REFUSER");
    const rejectPayload = buildMetaInteractiveButtonPayload(BUYER_PHONE, `TXN|${transaction.id}|REFUSER`, "REFUSER");
    await postToWhatsAppWebhook(rejectPayload);
    await sleep(2000);
    
    // Verify transaction is CANCELLED
    const finalTx = await getLatestTransactionForUser(BUYER_PHONE);
    if (!finalTx || finalTx.status !== "CANCELLED") {
      throw new Error(`Expected CANCELLED, got ${finalTx?.status}`);
    }
    
    log("✅", "Buyer rejection flow completed successfully");
    return true;
  } catch (error) {
    log("❌", `Test failed: ${error}`);
    return false;
  }
}

async function test_SellerCancelsTransaction(): Promise<boolean> {
  logTest("Seller Cancels Transaction Before Buyer Accepts");
  
  try {
    await cleanupTestData();
    await sleep(1000);
    
    // Create transaction
    log("📤", "Creating transaction");
    const aiMessage = buildMetaTextMessagePayload(VENDOR_PHONE, "Je veux vendre iPad Pro à 200$ au +27695446706");
    await postToWhatsAppWebhook(aiMessage);
    await sleep(2000);
    
    const confirmPayload = buildMetaInteractiveButtonPayload(VENDOR_PHONE, "AI_CONFIRM|YES", "Oui, continuer");
    await postToWhatsAppWebhook(confirmPayload);
    await sleep(2000);
    
    const transaction = await getLatestTransactionForUser(VENDOR_PHONE);
    if (!transaction || transaction.status !== "INITIATED") {
      throw new Error(`Expected INITIATED, got ${transaction?.status}`);
    }
    
    // Seller cancels BEFORE buyer accepts (transaction still in INITIATED state)
    log("📤", "Seller clicks ANNULER (before buyer accepts)");
    const cancelPayload = buildMetaInteractiveButtonPayload(VENDOR_PHONE, `TXN|${transaction.id}|ANNULER`, "ANNULER");
    await postToWhatsAppWebhook(cancelPayload);
    await sleep(2000);
    
    const finalTx = await getLatestTransactionForUser(VENDOR_PHONE);
    if (!finalTx || finalTx.status !== "CANCELLED") {
      throw new Error(`Expected CANCELLED, got ${finalTx?.status}`);
    }
    
    log("✅", "Seller cancellation flow completed successfully");
    return true;
  } catch (error) {
    log("❌", `Test failed: ${error}`);
    return false;
  }
}

async function test_PinFailureFlow(): Promise<boolean> {
  logTest("PIN Failure Flow (3 Wrong Attempts)");
  
  try {
    await cleanupTestData();
    await sleep(1000);
    
    // Create and secure transaction
    log("📤", "Creating and securing transaction");
    const aiMessage = buildMetaTextMessagePayload(VENDOR_PHONE, "Je veux vendre PS5 à 150$ au +27695446706");
    await postToWhatsAppWebhook(aiMessage);
    await sleep(2000);
    
    const confirmPayload = buildMetaInteractiveButtonPayload(VENDOR_PHONE, "AI_CONFIRM|YES", "Oui, continuer");
    await postToWhatsAppWebhook(confirmPayload);
    await sleep(2000);
    
    const transaction = await getLatestTransactionForUser(VENDOR_PHONE);
    if (!transaction) throw new Error("Transaction not created");
    
    const acceptPayload = buildMetaInteractiveButtonPayload(BUYER_PHONE, `TXN|${transaction.id}|ACCEPTER`, "ACCEPTER");
    await postToWhatsAppWebhook(acceptPayload);
    await sleep(2000);
    
    // Get the real PIN
    const realPin = await getTransactionPin(transaction.id);
    if (!realPin) throw new Error("No PIN generated");
    
    log("🔐", `Real PIN: ${realPin}`);
    
    // Attempt 1: Wrong PIN
    log("📤", "Vendor submits wrong PIN (attempt 1)");
    const wrongPin1 = buildMetaTextMessagePayload(VENDOR_PHONE, "0000");
    const result1 = await postToWhatsAppWebhook(wrongPin1);
    await sleep(2000);
    
    // Attempt 2: Wrong PIN
    log("📤", "Vendor submits wrong PIN (attempt 2)");
    const wrongPin2 = buildMetaTextMessagePayload(VENDOR_PHONE, "1111");
    await postToWhatsAppWebhook(wrongPin2);
    await sleep(2000);
    
    // Attempt 3: Wrong PIN (should lock)
    log("📤", "Vendor submits wrong PIN (attempt 3 - should lock)");
    const wrongPin3 = buildMetaTextMessagePayload(VENDOR_PHONE, "2222");
    await postToWhatsAppWebhook(wrongPin3);
    await sleep(2000);
    
    // Verify transaction is locked
    const finalTx = await getLatestTransactionForUser(VENDOR_PHONE);
    if (!finalTx || finalTx.status !== "PIN_FAILED_LOCKED") {
      throw new Error(`Expected PIN_FAILED_LOCKED, got ${finalTx?.status}`);
    }
    
    log("✅", "PIN failure flow completed successfully");
    return true;
  } catch (error) {
    log("❌", `Test failed: ${error}`);
    return false;
  }
}

async function test_AiPrefillRejection(): Promise<boolean> {
  logTest("AI Prefill Rejection Flow");
  
  try {
    await cleanupTestData();
    await sleep(1000);
    
    // Step 1: Vendor sends AI message
    log("📤", "Vendor sends AI message");
    const aiMessage = buildMetaTextMessagePayload(VENDOR_PHONE, "Je veux vendre Samsung Galaxy à 75$ au +27695446706");
    await postToWhatsAppWebhook(aiMessage);
    await sleep(2000);
    
    // Step 2: Vendor REJECTS AI prefill
    log("📤", "Vendor clicks 'Non, annuler'");
    const rejectPayload = buildMetaInteractiveButtonPayload(VENDOR_PHONE, "AI_CONFIRM|NO", "Non, annuler");
    await postToWhatsAppWebhook(rejectPayload);
    await sleep(2000);
    
    // Verify no transaction was created
    const transaction = await getLatestTransactionForUser(VENDOR_PHONE);
    if (transaction) {
      throw new Error("Transaction should not have been created after AI rejection");
    }
    
    // Verify AI draft was deleted
    const { data: draft } = await supabase
      .from("ai_transaction_drafts")
      .select("*")
      .eq("phone_number", VENDOR_PHONE)
      .maybeSingle();
    
    if (draft) {
      throw new Error("AI draft should have been deleted after rejection");
    }
    
    log("✅", "AI prefill rejection flow completed successfully");
    return true;
  } catch (error) {
    log("❌", `Test failed: ${error}`);
    return false;
  }
}

async function test_InvalidPhoneNumber(): Promise<boolean> {
  logTest("Invalid Phone Number Handling");
  
  try {
    await cleanupTestData();
    await sleep(1000);
    
    // Try to create transaction with invalid phone
    log("📤", "Vendor sends message with invalid phone number");
    const aiMessage = buildMetaTextMessagePayload(VENDOR_PHONE, `Je veux vendre Laptop à 300$ au ${INVALID_PHONE}`);
    const result = await postToWhatsAppWebhook(aiMessage);
    await sleep(2000);
    
    // AI will extract but phone normalization will fail, so counterparty_phone will be null
    // The webhook should NOT save an incomplete AI draft
    // Verify no AI draft was created
    const { data: draft } = await supabase
      .from("ai_transaction_drafts")
      .select("*")
      .eq("phone_number", VENDOR_PHONE)
      .maybeSingle();
    
    if (draft) {
      throw new Error("AI draft should not have been saved with invalid phone");
    }
    
    log("✅", "AI draft correctly rejected due to invalid phone");
    
    // When vendor tries to confirm, should get "no draft" error
    log("📤", "Vendor tries to confirm (should fail - no draft exists)");
    const confirmPayload = buildMetaInteractiveButtonPayload(VENDOR_PHONE, "AI_CONFIRM|YES", "Oui, continuer");
    const confirmResult = await postToWhatsAppWebhook(confirmPayload);
    await sleep(2000);
    
    // Check that confirmation was rejected
    const confirmBody = confirmResult.body as { routed_messages?: Array<{ responseMessage?: string; allowed?: boolean }> };
    const confirmMessages = confirmBody.routed_messages || [];
    
    if (confirmMessages.length === 0) {
      throw new Error("No routed messages found for confirmation");
    }
    
    const confirmMessage = confirmMessages[0];
    const responseMessage = confirmMessage.responseMessage || "";
    
    // Should contain error about no draft found
    if (!responseMessage.includes("Aucun brouillon") && !responseMessage.includes("No draft")) {
      throw new Error(`Expected 'no draft' error, got: ${responseMessage}`);
    }
    
    // Verify no transaction was created
    const transaction = await getLatestTransactionForUser(VENDOR_PHONE);
    if (transaction) {
      throw new Error("Transaction should not have been created with invalid phone");
    }
    
    log("✅", "Invalid phone number handling completed successfully");
    return true;
  } catch (error) {
    log("❌", `Test failed: ${error}`);
    return false;
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 CLAIRTUS COMPREHENSIVE E2E TEST SUITE");
  console.log("=".repeat(80));
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Vendor: ${VENDOR_PHONE}`);
  console.log(`Buyer: ${BUYER_PHONE}`);
  console.log("=".repeat(80) + "\n");

  const results: { name: string; passed: boolean }[] = [];

  // Run all tests
  results.push({ name: "Buyer Rejects Transaction", passed: await test_BuyerRejectsTransaction() });
  await sleep(2000);
  
  results.push({ name: "Seller Cancels Transaction", passed: await test_SellerCancelsTransaction() });
  await sleep(2000);
  
  results.push({ name: "PIN Failure Flow", passed: await test_PinFailureFlow() });
  await sleep(2000);
  
  results.push({ name: "AI Prefill Rejection", passed: await test_AiPrefillRejection() });
  await sleep(2000);
  
  results.push({ name: "Invalid Phone Number", passed: await test_InvalidPhoneNumber() });

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log("📊 TEST SUITE SUMMARY");
  console.log("=".repeat(80));
  
  let passedCount = 0;
  let failedCount = 0;
  
  for (const result of results) {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${status} - ${result.name}`);
    if (result.passed) passedCount++;
    else failedCount++;
  }
  
  console.log("=".repeat(80));
  console.log(`Total: ${results.length} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log("=".repeat(80) + "\n");
  
  if (failedCount === 0) {
    console.log("🎉 ALL TESTS PASSED!");
    Deno.exit(0);
  } else {
    console.log("⚠️  SOME TESTS FAILED");
    Deno.exit(1);
  }
}

main();
