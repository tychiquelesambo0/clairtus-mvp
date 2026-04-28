📋 CLAIRTUS: MASTER ENGINEERING & PRODUCT BLUEPRINT

DOCUMENT CONTROL
Product Name: Clairtus
Document Type: Master Product Requirements Document (PRD) & Engineering Blueprint
Target Release: MVP (Version 1.0)
Primary Market: Democratic Republic of Congo (DRC)
Supported Language: French (FR)
Supported Currency: United States Dollar (USD) Only


1. Executive Summary & Strategic Context
To the Engineering Team: This document is your bible. If a feature or logic flow is not in this document, it does not exist in V1.
Clairtus is a WhatsApp-native escrow bot designed to eliminate the massive trust deficit in the African informal social commerce market (specifically the DRC). Buyers fear being scammed; vendors fear the logistics costs of rejected "Pay on Delivery" orders.
The Business Logic (The "Why"):
We are legally operating under a "Commercial Agent" framework. We are not a bank. Therefore, our system acts strictly as a software routing layer. We hold buyer funds in a licensed PawaPay Collection Wallet. We mathematically guarantee the physical handover of goods via a 4-digit Secret PIN. Upon validation, we trigger an instant payout to the vendor from a pre-funded PawaPay Payout Wallet (our working capital float).
Strict Engineering Guardrails:
Zero App Footprint: 100% of user interaction happens via the Meta WhatsApp Cloud API.
USD Monocurrency: The MVP strictly enforces USD. If a user inputs CDF, the system must reject it. PawaPay routing must be configured for USD MoMo wallets.
Delivery is Out of Scope: We do not calculate fractional delivery fees, nor do we integrate with logistics APIs. The vendor must input a single, final USD price that includes their delivery costs.
Binary Escrow: Funds are released only upon the exact matching of the 4-digit PIN. We do not build logic for subjective quality mediation.


2. Target Personas & UX Psychology
Our UI is purely conversational. Copywriting and speed are our only design tools.
Amina (The Vendor): Highly stressed, low margins. Pays motorcycle couriers out of pocket.
Engineering mandate: The payout webhook (COMPLETED state) must execute in under 3 seconds. The courier is waiting on the street; latency kills trust.
Didier (The Buyer): Highly sceptical, fears losing his money.
Engineering mandate: System messages must feel institutional. Interactive buttons must be used to prevent typos and provide a "software" feel inside WhatsApp.


3. Core Feature Scope (MoSCoW Prioritisation)
MUST HAVE (Launch Blockers)
Supabase Backend: PostgreSQL database for state tracking, Row Level Security (RLS) for data integrity, and Edge Functions for webhook processing.
Meta Cloud API Integration: Full support for inbound/outbound messages and Interactive Message objects (Buttons).
PawaPay API Integration:
/v1/deposits (Collections)
/v1/payouts (Disbursements)
/v1/balances (Float monitoring)
The State Machine: Dual-sided initiation logic (Buyer or Vendor can start).
PIN Engine: Cryptographically secure 4-digit generation and exact-match validation.
Global Escape Hatch: The AIDE command to pause automation and route to a human admin.
WON'T HAVE (Kill List for MVP)
Custom Mobile Apps or Web Portals for users.
Cross-border FX routing or CDF currency support.
Automated subjective dispute resolution AI.
Fractional fee splitting for couriers/motards.


4. The Conversational Architecture & State Machine
Every transaction is a row in the transactions table. The status column dictates exactly what the bot is allowed to say and do.
State 1: INITIATED
Trigger: User texts a formatted string: Vente [Montant] USD [Article] au [Numéro].
System Action:
Parse string regex. Verify currency is "USD". Verify phone number format.
Query the users table for the initiator and the target to pull Trust Scores.
Create a transaction row. Status = INITIATED.
Bot Output (To Target via Meta Interactive Button Template):
🔒 Clairtus - Sécurisation de paiement
Le vendeur (0898765432) souhaite vous vendre : [Article] pour [Montant] USD.
📊 Statistiques du Vendeur : 🟢 [X] ventes | ❌ [Y] annulations.
Votre argent sera bloqué en sécurité jusqu'à la livraison.
[ Bouton: ACCÉPTER ] [ Bouton: REFUSER ]
State 2: PENDING_FUNDING
Trigger: Buyer clicks [ ACCEPTER ] payload.
System Action:
Update status to PENDING_FUNDING.
Ping PawaPay /v1/deposits using transaction_id as Idempotency Key. Request base_amount + MNO Fee.
Bot Output (To Buyer):
Parfait. Cliquez sur ce lien sécurisé pour bloquer vos fonds via Mobile Money : [PawaPay URL]
State 3: SECURED (The Vault)
Trigger: PawaPay Webhook confirms successful deposit.
System Action:
Generate a 4-digit secret_pin. Save to DB.
Update status to SECURED.
Bot Output (To Vendor):
✅ Fonds Sécurisés !
Le client a bloqué [Montant] USD. Livrez la commande. Demandez au client son Code PIN à 4 chiffres et envoyez-le ici pour être payé.
Bot Output (To Buyer):
🔐 Paiement Bloqué.
Voici votre code PIN de livraison : [ XXXX ]
⚠️ ALERTE SÉCURITÉ : Le livreur NE PEUT PAS vous demander ce code par téléphone. Ne donnez ce code que lorsque vous tenez l'article dans vos mains.
State 4: COMPLETED
Trigger: Vendor replies with a 4-digit string.
System Action:
Check string against secret_pin in DB.
If match: Ping PawaPay /v1/payouts requesting base_amount minus 2.5% Clairtus commission. Debit from Pre-Funded Payout Wallet.
Update status to COMPLETED. Increment successful_transactions for both users.
Bot Output (To Vendor):
🎉 Succès ! Code valide. Vos fonds ([Montant calculé] USD) sont en route vers votre compte Mobile Money.
Global State: HUMAN_SUPPORT
Trigger: User clicks [ AIDE ] or types "Aide", "Help", or "Support".
System Action: Flag requires_human = true in DB. Halt all automated responses for this transaction_id. Push notification to the Next.js Admin panel.


5. Technical Architecture & Data Models
5.1 Infrastructure Stack
Database & Auth: Supabase (PostgreSQL).
Compute: Supabase Edge Functions (Deno/TypeScript) for webhook handling to ensure sub-second response times.
Admin Panel: Next.js hosted on Vercel.
5.2 Database Schema
Table: users
SQL


CREATE TABLE users (
    phone_number VARCHAR(20) PRIMARY KEY, -- Standardized E.164 format (e.g., +243...)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    successful_transactions INT DEFAULT 0,
    cancelled_transactions INT DEFAULT 0,
    is_suspended BOOLEAN DEFAULT FALSE,
    trust_score_cache DECIMAL(3,2) -- Auto-calculated metric for fast querying
);


Table: transactions
SQL


CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '72 hours',
    status VARCHAR(50) NOT NULL, -- INITIATED, PENDING_FUNDING, SECURED, COMPLETED, CANCELLED, DISPUTED, PAYOUT_FAILED, HUMAN_SUPPORT
    seller_phone VARCHAR(20) REFERENCES users(phone_number),
    buyer_phone VARCHAR(20) REFERENCES users(phone_number),
    item_description TEXT NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD' CHECK (currency = 'USD'),
    base_amount DECIMAL(10,2) NOT NULL,
    clairtus_fee DECIMAL(10,2) NOT NULL, -- Stored statically at creation (e.g., 2.5% of base)
    secret_pin VARCHAR(4),
    pawapay_deposit_id VARCHAR(100) UNIQUE,
    pawapay_payout_id VARCHAR(100) UNIQUE,
    requires_human BOOLEAN DEFAULT FALSE
);


5.3 Webhook Security & Idempotency
Meta Cloud API Security: Every payload hitting /api/whatsapp-webhook MUST be validated using the X-Hub-Signature-256 header mapped against our Meta App Secret. Reject unauthorised requests instantly.
PawaPay Security: Validate PawaPay webhooks using their documented signature verification method.
Idempotency: Supabase transactions.id (UUID) MUST be passed as the idempotency key for all PawaPay API calls. This mathematically prevents double-charging a buyer or double-paying a vendor if the network stutters.


6. Self-Healing Logic & Edge Case Management
The system must automatically handle the realities of African telecommunications without human intervention.
Edge Case 1: PawaPay Payout Wallet Limit Exceeded (Tier 1 Wallets)
Trigger: PawaPay returns RECEIVER_LIMIT_EXCEEDED.
System Action: Change state to PAYOUT_FAILED.
Bot Output: "Votre compte Mobile Money a atteint sa limite. Veuillez le vider, puis cliquez sur [ Réessayer le paiement ]."
Edge Case 2: MNO Network Timeout (Vodacom/Airtel Down)
Trigger: PawaPay returns 503 Service Unavailable or Timeout during PIN validation.
System Action: Change state to PAYOUT_DELAYED. Bot messages vendor: "Code valide! Le réseau Mobile Money est lent. Vos fonds sont sécurisés et seront transférés automatiquement dès le retour du réseau."
Resolution: A Supabase CRON job runs every 15 minutes, selecting all PAYOUT_DELAYED transactions and retrying the PawaPay Disbursement API using the same Idempotency Key.
Edge Case 3: The 72-Hour Ghosting (TTL)
Trigger: Transaction sits in SECURED state for > 72 hours.
System Action: Supabase CRON job sweeps hourly. If NOW() > expires_at, trigger PawaPay Refund API. Change state to CANCELLED. Increment cancelled_transactions for the seller (penalty for failing to deliver).
Edge Case 4: The Float Depletion Kill-Switch
Trigger: Pre-funded Payout Wallet drops below $500.
System Action: Supabase Edge Function blocks the creation of new INITIATED rows. Bot intercepts new commands with: "Clairtus est actuellement en maintenance technique pour garantir la liquidité. Réessayez plus tard."


7. Telemetry & Analytics (SQL Requirements)
Engineering will build these exact SQL views into the Supabase dashboard so product management can track health on Day 1.
Metric 1: Gross Merchandise Value (GMV)
SQL


-- Tracks real revenue flow
SELECT 
    DATE_TRUNC('week', created_at) as week,
    SUM(base_amount) as total_gmv_usd,
    SUM(clairtus_fee) as net_revenue_usd
FROM transactions
WHERE status = 'COMPLETED'
GROUP BY week
ORDER BY week DESC;


Metric 2: Dispute / Failure Rate (The Health Check)
SQL


-- Must remain under 2%
SELECT 
    COUNT(*) FILTER (WHERE status IN ('DISPUTED', 'CANCELLED')) * 100.0 / NULLIF(COUNT(*), 0) AS failure_rate_percentage
FROM transactions
WHERE created_at >= NOW() - INTERVAL '30 days';


Metric 3: The Viral Coefficient (K-Factor Base)
SQL


-- Tracks how many sellers initiated transactions with brand new buyers, and vice versa.
SELECT 
    COUNT(DISTINCT t.buyer_phone) AS new_users_acquired
FROM transactions t
LEFT JOIN users u ON t.buyer_phone = u.phone_number
WHERE u.created_at >= NOW() - INTERVAL '7 days' AND t.status = 'COMPLETED';





8. Development Phases & Milestones
To ensure rapid deployment, engineering will execute in three strict phases:
Phase 1: Foundation (Days 1-7)
Provision the Supabase project. Deploy schemas.
Set up Meta Cloud API WhatsApp test numbers.
Map conversational state machine using hardcoded mocked responses (no real money yet).
Phase 2: Financial Piping (Days 8-15)
Integrate PawaPay Sandbox APIs.
Build out idempotency logic and Webhook listeners.
Test Fee calculation engine (USD only).
Phase 3: Hardening & Edge Cases (Days 16-21)
Implement Interactive Buttons (Meta API) to replace text commands.
Write CRON jobs for 72-hour TTL and MNO Timeout retries.
Deploy Next.js Admin Panel with manual AIDE chat takeover capability.
Final Sign-Off Note to Engineering: Simplicity scales. Do not over-engineer the logistics. Do not build web UI. Trust the state machine. Godspeed.

