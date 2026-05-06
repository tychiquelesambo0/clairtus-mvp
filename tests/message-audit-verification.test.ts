/**
 * UNICORN FINTECH MESSAGE AUDIT VERIFICATION TEST
 * 
 * This test suite verifies 100% alignment between implemented messages
 * and the amended WhatsApp Messages Audit document requirements.
 * 
 * ALL TESTS MUST PASS AT 100% RATE.
 */

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Test Suite 1: Forbidden Words & Terminology
Deno.test("CRITICAL: No 'bloqué' instances in codebase", async () => {
  const cmd = new Deno.Command("grep", {
    args: ["-r", "-i", "bloqu", "supabase/functions/", "--include=*.ts"],
    cwd: "/Users/cash/clairtus-mvp",
  });
  
  const { code, stdout } = await cmd.output();
  const output = new TextDecoder().decode(stdout);
  
  assertEquals(
    code,
    1, // grep returns 1 when no matches found
    `FAILED: Found 'bloqué' instances:\n${output}\nMust use 'sécurisé', 'séquestré', or 'mis en sécurité' instead.`
  );
});

Deno.test("CRITICAL: All currency symbols use $ not USD in French messages", async () => {
  const cmd = new Deno.Command("grep", {
    args: [
      "-r",
      "-E",
      "[0-9]+ USD|USD [0-9]+",
      "supabase/functions/",
      "--include=*.ts",
    ],
    cwd: "/Users/cash/clairtus-mvp",
  });
  
  const { stdout } = await cmd.output();
  const output = new TextDecoder().decode(stdout);
  
  // Filter out backend logic (currency field, API calls)
  const userFacingMatches = output
    .split("\n")
    .filter(line => 
      line.includes("messageText") || 
      line.includes("responseMessage") ||
      line.includes("bodyText")
    );
  
  assertEquals(
    userFacingMatches.length,
    0,
    `FAILED: Found USD in user-facing messages:\n${userFacingMatches.join("\n")}\nMust use $ symbol instead.`
  );
});

Deno.test("CRITICAL: Phone number examples use +243810000000 format", async () => {
  const cmd = new Deno.Command("grep", {
    args: [
      "-r",
      "-E",
      "\\+243[0-9]{9}",
      "supabase/functions/",
      "--include=*.ts",
    ],
    cwd: "/Users/cash/clairtus-mvp",
  });
  
  const { stdout } = await cmd.output();
  const output = new TextDecoder().decode(stdout);
  
  const phoneExamples = output
    .split("\n")
    .filter(line => line.includes("+243"));
  
  // Verify all examples use the correct format
  for (const line of phoneExamples) {
    if (line.includes("messageText") || line.includes("responseMessage")) {
      assertStringIncludes(
        line,
        "+243810000000",
        `Phone example should use +243810000000 format: ${line}`
      );
    }
  }
});

// Test Suite 2: Critical PIN Messages (Dispute Eradication)
Deno.test("CRITICAL: PIN message 4.1 - Buyer receives hardened PIN copy", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/pawapay-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🔒 FONDS SÉCURISÉS AVEC SUCCÈS",
    "Missing hardened PIN header"
  );
  
  assertStringIncludes(
    file,
    "🔑 VOTRE CODE PIN SECRET:",
    "Missing PIN label"
  );
  
  assertStringIncludes(
    file,
    "⚠️ RÈGLE D'OR :",
    "Missing golden rule section"
  );
  
  assertStringIncludes(
    file,
    "Ne partagez JAMAIS ce code par message ou par appel avant d'avoir l'article en main",
    "Missing critical PIN sharing warning"
  );
});

Deno.test("CRITICAL: PIN message 4.2 - Seller receives clear instructions", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/pawapay-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🔒 L'ACHETEUR A PAYÉ",
    "Missing seller notification header"
  );
  
  assertStringIncludes(
    file,
    "👉 VOS INSTRUCTIONS :",
    "Missing seller instructions section"
  );
  
  assertStringIncludes(
    file,
    "demandez à l'acheteur son code PIN secret à 4 chiffres",
    "Missing PIN request instruction"
  );
});

Deno.test("CRITICAL: PIN validation 4.5 - Verification message", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🔐 Analyse du code PIN...",
    "Missing PIN analysis message"
  );
  
  assertStringIncludes(
    file,
    "Vérification cryptographique en cours",
    "Missing cryptographic verification message"
  );
});

Deno.test("CRITICAL: PIN validation 4.6 - Correct PIN message", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/state-machine/index.ts");
  
  assertStringIncludes(
    file,
    "✅ CODE PIN VALIDE",
    "Missing PIN valid confirmation"
  );
  
  assertStringIncludes(
    file,
    "Le contrat est rempli. Décaissement automatique",
    "Missing contract fulfillment message"
  );
});

Deno.test("CRITICAL: PIN validation 4.7 - Incorrect PIN with retry", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/state-machine/index.ts");
  
  assertStringIncludes(
    file,
    "⚠️ Code PIN incorrect",
    "Missing incorrect PIN message"
  );
  
  assertStringIncludes(
    file,
    "Il vous reste",
    "Missing retry count message"
  );
});

Deno.test("CRITICAL: PIN validation 4.8 - Transaction locked after 3 failures", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/state-machine/index.ts");
  
  assertStringIncludes(
    file,
    "🚫 SÉCURITÉ DÉCLENCHÉE : Transaction verrouillée",
    "Missing security lock message"
  );
  
  assertStringIncludes(
    file,
    "3 échecs consécutifs",
    "Missing failure count"
  );
  
  assertStringIncludes(
    file,
    "Tapez AIDE pour parler à un arbitre",
    "Missing arbitration instruction"
  );
});

// Test Suite 3: Identity Capture Flow (1.1-1.7)
Deno.test("Identity 1.1 - Welcome message with security protocol", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🔒 Initialisation du protocole de sécurité",
    "Missing security protocol initialization"
  );
  
  assertStringIncludes(
    file,
    "L'ultime couche de confiance pour vos affaires: zéro fraude, zéro stress",
    "Missing value proposition"
  );
});

Deno.test("Identity 1.7 - Session expired message", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "⏱️ Session de sécurité expirée",
    "Missing session expiry message"
  );
  
  assertStringIncludes(
    file,
    "Pour votre protection, les sessions inactives sont fermées",
    "Missing security explanation"
  );
});

// Test Suite 4: Guided Transaction Flow (2.1-2.15)
Deno.test("Guided 2.1 - Returning user welcome", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🔒 Bonjour",
    "Missing personalized greeting"
  );
  
  assertStringIncludes(
    file,
    "Votre profil est sécurisé. Prêt à faire des affaires sans risque ?",
    "Missing security confirmation"
  );
});

Deno.test("Guided 2.3 - SELL mode activation", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "📦 *Mode VENTE activé*",
    "Missing SELL mode header"
  );
  
  assertStringIncludes(
    file,
    "💡 Astuce Clairtus : Ne déplacez jamais votre marchandise pour rien",
    "Missing seller tip"
  );
});

Deno.test("Guided 2.4 - BUY mode activation", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🛍️ *Mode ACHAT activé*",
    "Missing BUY mode header"
  );
  
  assertStringIncludes(
    file,
    "💡 Astuce Clairtus : Ne payez plus jamais dans le vide",
    "Missing buyer tip"
  );
});

// Test Suite 5: Error Messages (5.1-5.11)
Deno.test("Error 5.1 - Phone format error", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/_shared/phone.ts");
  
  assertStringIncludes(
    file,
    "⚠️ Numéro invalide",
    "Missing phone error header"
  );
  
  assertStringIncludes(
    file,
    "Exemple : +243810000000",
    "Missing phone example"
  );
});

Deno.test("Error 5.2 - Language not recognized", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "⚠️ Langue non reconnue",
    "Missing language error"
  );
  
  assertStringIncludes(
    file,
    "L'interface Clairtus opère uniquement en français pour des raisons légales",
    "Missing legal explanation"
  );
});

Deno.test("Error 5.3 - Account suspended", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🚫 Accès restreint",
    "Missing suspension header"
  );
  
  assertStringIncludes(
    file,
    "département de conformité pour activité suspecte",
    "Missing compliance explanation"
  );
});

// Test Suite 6: Fallback Messages (8.1-8.15)
Deno.test("Fallback 8.2 - Unknown command no active transaction", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🤖 Commande non reconnue",
    "Missing robot emoji for automated system"
  );
  
  assertStringIncludes(
    file,
    "Clairtus est un terminal automatisé",
    "Missing automation explanation"
  );
});

Deno.test("Fallback 8.7 - SECURED state seller", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🔒 Les fonds sont en sécurité. Vous devez livrer l'article",
    "Missing seller SECURED instruction"
  );
  
  assertStringIncludes(
    file,
    "👉 Tapez uniquement les 4 chiffres du code PIN ici",
    "Missing PIN submission instruction"
  );
});

Deno.test("Fallback 8.15 - Human support ticket", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🎫 Ticket de support ouvert",
    "Missing support ticket message"
  );
  
  assertStringIncludes(
    file,
    "Un arbitre humain Clairtus va examiner votre dossier",
    "Missing arbitration explanation"
  );
  
  assertStringIncludes(
    file,
    "Vos fonds restent strictement sécurisés pendant l'investigation",
    "Missing fund security assurance"
  );
});

// Test Suite 7: Cron Job Messages (7.1-7.6)
Deno.test("Cron 7.1 - TTL expired seller notification", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/cron-jobs/ttl-enforcement/index.ts");
  
  assertStringIncludes(
    file,
    "⏱️ Transaction expirée",
    "Missing TTL expiry message"
  );
  
  assertStringIncludes(
    file,
    "L'acheteur n'a pas validé le contrat dans le délai de 24 h",
    "Missing buyer timeout explanation"
  );
});

Deno.test("Cron 7.6 - Payout retry technical intervention", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/cron-jobs/payout-retry/index.ts");
  
  assertStringIncludes(
    file,
    "⚙️ Intervention technique en cours",
    "Missing technical intervention message"
  );
  
  assertStringIncludes(
    file,
    "Notre équipe financière a pris le relais et procède au déblocage manuel",
    "Missing manual intervention explanation"
  );
  
  assertStringIncludes(
    file,
    "Vos fonds sont garantis",
    "Missing fund guarantee"
  );
});

// Test Suite 8: Test Mode Messages (10.1-10.2)
Deno.test("Test Mode 10.1 - Sandbox buyer notification", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🧪 MODE SANDBOX ACTIF",
    "Missing sandbox mode indicator"
  );
  
  assertStringIncludes(
    file,
    "Paiement fictif validé",
    "Missing fictitious payment message"
  );
});

// Test Suite 9: Refund Messages (11.1-11.2)
Deno.test("Refund 11.1 - Buyer refund executed", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/pawapay-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "💸 Remboursement exécuté",
    "Missing refund execution message"
  );
  
  assertStringIncludes(
    file,
    "La transaction est définitivement annulée",
    "Missing definitive cancellation"
  );
});

Deno.test("Refund 11.2 - Seller sale cancelled", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/pawapay-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🚫 Vente annulée",
    "Missing sale cancellation message"
  );
  
  assertStringIncludes(
    file,
    "Ceci a été noté dans l'historique de votre profil",
    "Missing profile impact note"
  );
});

// Test Suite 10: Transaction Management (6.1-6.7)
Deno.test("Transaction 6.1 - Empty transaction list", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "📭 Votre registre est vide",
    "Missing empty registry message"
  );
});

Deno.test("Transaction 6.3 - Transaction detail view", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🔍 Dossier :",
    "Missing dossier label"
  );
  
  assertStringIncludes(
    file,
    "Montant sécurisé :",
    "Missing secured amount label"
  );
  
  assertStringIncludes(
    file,
    "👉 Prochaine action :",
    "Missing next action label"
  );
});

Deno.test("Transaction 6.7 - Counterparty reminder", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🔔 Rappel de Sécurité Clairtus",
    "Missing security reminder header"
  );
  
  assertStringIncludes(
    file,
    "Une transaction est toujours en attente de votre validation",
    "Missing pending validation message"
  );
});

// Test Suite 11: Bank Vault Terminology Verification
Deno.test("CRITICAL: Bank Vault terminology - 'Protocole' usage", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "protocole de sécurité",
    "Missing 'protocole' terminology"
  );
});

Deno.test("CRITICAL: Bank Vault terminology - 'Séquestre' usage", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/pawapay-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "compte de séquestre Clairtus",
    "Missing 'séquestre' terminology"
  );
});

Deno.test("CRITICAL: Bank Vault terminology - 'Dossier' usage", async () => {
  const file = await Deno.readTextFile("/Users/cash/clairtus-mvp/supabase/functions/whatsapp-webhook/index.ts");
  
  assertStringIncludes(
    file,
    "🔍 Dossier :",
    "Missing 'dossier' terminology in transaction details"
  );
});

console.log("\n✅ ALL MESSAGE AUDIT TESTS COMPLETED\n");
