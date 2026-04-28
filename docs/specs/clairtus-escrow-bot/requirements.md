# Requirements Document

## Introduction

Clairtus is a WhatsApp-native escrow bot that eliminates trust deficits in DRC informal social commerce by securing buyer funds in a PawaPay Collection Wallet and releasing them to vendors only upon 4-digit PIN validation. The system operates as a "Commercial Agent" (not a bank), providing a binary escrow mechanism through conversational interfaces with zero mobile app footprint.

## Glossary

- **Clairtus_System**: The complete WhatsApp-native escrow bot including state machine, webhook handlers, and database
- **Transaction**: A single escrow operation tracked from initiation through completion or cancellation
- **State_Machine**: The core logic engine that manages transaction status transitions
- **Buyer**: The user purchasing goods who deposits funds into escrow
- **Vendor**: The user selling goods who receives payout after PIN validation
- **Secret_PIN**: A cryptographically secure 4-digit code generated for delivery confirmation
- **Trust_Score**: A user's transaction history displayed as successful vs cancelled transaction counts
- **PawaPay_API**: The payment gateway providing deposit, payout, refund, and balance APIs
- **Meta_WhatsApp_API**: The Meta Cloud API used for all conversational interactions
- **Interactive_Button**: A Meta API message component providing clickable options
- **Base_Amount**: The transaction value in USD excluding fees
- **MNO_Fee**: Mobile Network Operator fee (1.5% of base_amount) paid by buyer
- **Clairtus_Fee**: Platform commission (2.5% of base_amount) deducted from vendor payout
- **E164_Format**: International phone number format (+243XXXXXXXXX for DRC)
- **Idempotency_Key**: Transaction UUID used to prevent duplicate API calls
- **TTL**: Time-to-live (72 hours) before automatic transaction expiration
- **Float**: Pre-funded balance in PawaPay Payout Wallet for vendor disbursements
- **Admin_Panel**: Next.js web interface for manual intervention and monitoring
- **CRON_Job**: Scheduled background task for automated system maintenance
- **Webhook**: HTTP callback from external services (PawaPay, Meta) to trigger state changes

## Requirements

### Requirement 1: Transaction Initiation

**User Story:** As a Vendor or Buyer, I want to initiate an escrow transaction via WhatsApp text command, so that I can start a secure payment process with my counterparty.

#### Acceptance Criteria

1. WHEN a Vendor sends "Vente [Montant] USD [Article] au [Numéro]", THE Clairtus_System SHALL parse the message and create a Transaction with status INITIATED
2. WHEN a Buyer sends "Achat [Montant] USD [Article] au [Numéro Vendeur]", THE Clairtus_System SHALL parse the message and create a Transaction with status INITIATED
3. WHEN a user includes "CDF" as currency, THE Clairtus_System SHALL reject the message and respond "Clairtus accepte uniquement USD pour le moment"
4. WHEN the phone number format is 10 digits starting with 0, THE Clairtus_System SHALL strip the leading 0 and prepend +243 to create E164_Format
5. WHEN the phone number after correction is not exactly 9 digits, THE Clairtus_System SHALL reject the message and respond "Numéro de téléphone invalide. Format attendu: 0XXXXXXXXX"
6. WHEN a Transaction is created, THE Clairtus_System SHALL query Trust_Score for both Buyer and Vendor from the users table
7. WHEN a Transaction is created, THE Clairtus_System SHALL set expires_at to 72 hours from creation time
8. WHEN a Transaction is created, THE Clairtus_System SHALL calculate and store Clairtus_Fee as 2.5% of Base_Amount
9. WHEN a Transaction remains in INITIATED status for 24 hours, THE Clairtus_System SHALL transition status to CANCELLED and notify the initiator

### Requirement 2: Counterparty Acceptance

**User Story:** As a Buyer or Vendor, I want to accept or reject an incoming transaction request via Interactive_Button, so that I can control whether to proceed with the escrow.

#### Acceptance Criteria

1. WHEN a Transaction enters INITIATED status, THE Clairtus_System SHALL send an Interactive_Button message to the counterparty with ACCEPTER and REFUSER options
2. THE Interactive_Button message SHALL display "🔒 Clairtus - Sécurisation de paiement"
3. THE Interactive_Button message SHALL display the initiator's phone number, item description, and Base_Amount
4. THE Interactive_Button message SHALL display Trust_Score formatted as "📊 Statistiques: 🟢 [X] ventes réussies | ❌ [Y] annulations"
5. WHEN the counterparty clicks ACCEPTER, THE Clairtus_System SHALL transition Transaction status to PENDING_FUNDING
6. WHEN the counterparty clicks REFUSER, THE Clairtus_System SHALL transition Transaction status to CANCELLED
7. WHEN Transaction status becomes CANCELLED, THE Clairtus_System SHALL increment cancelled_transactions for the initiator in the users table
8. WHEN the counterparty's device cannot render buttons and they reply with text ("Accepter", "Oui", "Accepte", or "Refuser", "Non"), THE Clairtus_System SHALL process the text input exactly as if the corresponding Interactive_Button payload was clicked

### Requirement 3: Buyer Funding

**User Story:** As a Buyer, I want to deposit funds via PawaPay Mobile Money, so that the escrow can secure my payment until delivery.

#### Acceptance Criteria

1. WHEN Transaction status becomes PENDING_FUNDING, THE Clairtus_System SHALL call PawaPay /v1/deposits API with Base_Amount plus 1.5% MNO_Fee
2. THE PawaPay deposit request SHALL use Transaction id as Idempotency_Key
3. WHEN PawaPay returns a deposit URL, THE Clairtus_System SHALL send the URL to the Buyer with message "Parfait. Cliquez sur ce lien sécurisé pour bloquer vos fonds via Mobile Money"
4. WHEN PawaPay webhook confirms successful deposit, THE Clairtus_System SHALL transition Transaction status to SECURED
5. IF PawaPay deposit fails after 30 minutes, THEN THE Clairtus_System SHALL transition Transaction status to CANCELLED and notify both parties

### Requirement 4: PIN Generation and Distribution

**User Story:** As the Clairtus_System, I want to generate and distribute a Secret_PIN when funds are secured, so that delivery can be cryptographically verified.

#### Acceptance Criteria

1. WHEN Transaction status becomes SECURED, THE Clairtus_System SHALL generate a cryptographically secure 4-digit Secret_PIN
2. THE Secret_PIN SHALL contain only numeric characters 0-9
3. THE Secret_PIN SHALL be stored in the secret_pin column of the transactions table
4. WHEN Secret_PIN is generated, THE Clairtus_System SHALL send the PIN to the Buyer with message "🔐 Paiement Bloqué. Voici votre code PIN de livraison: [XXXX]"
5. THE Buyer message SHALL include security warning "⚠️ ALERTE SÉCURITÉ: Le livreur NE PEUT PAS vous demander ce code par téléphone. Ne donnez ce code que lorsque vous tenez l'article dans vos mains."
6. WHEN Secret_PIN is generated, THE Clairtus_System SHALL send notification to Vendor "✅ Fonds Sécurisés! Le client a bloqué [Montant] USD. Livrez la commande. Demandez au client son Code PIN à 4 chiffres et envoyez-le ici pour être payé."

### Requirement 5: PIN Validation and Payout

**User Story:** As a Vendor, I want to submit the buyer's PIN to trigger payout, so that I receive payment immediately upon successful delivery.

#### Acceptance Criteria

1. WHILE Transaction status is SECURED, THE Clairtus_System SHALL accept 4-digit numeric input from the Vendor
2. WHEN Vendor submits a 4-digit code, THE Clairtus_System SHALL compare it against the stored Secret_PIN
3. WHEN the submitted code matches Secret_PIN, THE Clairtus_System SHALL call PawaPay /v1/payouts API requesting Base_Amount minus Clairtus_Fee
4. THE PawaPay payout request SHALL use Transaction id as Idempotency_Key
5. WHEN PawaPay confirms successful payout, THE Clairtus_System SHALL transition Transaction status to COMPLETED
6. WHEN Transaction status becomes COMPLETED, THE Clairtus_System SHALL increment successful_transactions for both Buyer and Vendor in users table
7. WHEN Transaction status becomes COMPLETED, THE Clairtus_System SHALL send confirmation to Vendor "🎉 Succès! Code valide. Vos fonds ([Montant calculé] USD) sont en route vers votre compte Mobile Money."
8. WHEN Transaction status becomes COMPLETED, THE Clairtus_System SHALL send confirmation to Buyer "✅ Transaction terminée. Le vendeur a reçu le paiement."
9. THE payout webhook execution SHALL complete within 3 seconds from PIN validation

### Requirement 6: PIN Attempt Limiting

**User Story:** As the Clairtus_System, I want to limit PIN validation attempts to 3, so that I can prevent brute-force attacks and protect buyer funds.

#### Acceptance Criteria

1. WHEN Vendor submits incorrect PIN on attempt 1 or 2, THE Clairtus_System SHALL respond "Code incorrect. Veuillez réessayer. ([X]/3 tentatives)"
2. WHEN Vendor submits incorrect PIN on attempt 3, THE Clairtus_System SHALL transition Transaction status to PIN_FAILED_LOCKED
3. WHEN Transaction status becomes PIN_FAILED_LOCKED, THE Clairtus_System SHALL set requires_human to TRUE
4. WHEN Transaction status becomes PIN_FAILED_LOCKED, THE Clairtus_System SHALL notify Buyer "🔒 Sécurité: Le vendeur a échoué 3 tentatives de code. Vos fonds sont bloqués. Un agent Clairtus vous contactera."
5. WHEN Transaction status becomes PIN_FAILED_LOCKED, THE Clairtus_System SHALL notify Vendor "❌ Code incorrect. Transaction verrouillée après 3 tentatives. Contactez le support."
6. WHEN Transaction status becomes PIN_FAILED_LOCKED, THE Clairtus_System SHALL send alert to Admin_Panel

### Requirement 7: Human Support Escalation

**User Story:** As a Buyer or Vendor, I want to request human assistance at any time, so that I can resolve issues that automated logic cannot handle.

#### Acceptance Criteria

1. WHEN a user sends "AIDE", "Aide", "Help", or "Support", THE Clairtus_System SHALL set requires_human to TRUE for the active Transaction
2. WHEN a user clicks an AIDE Interactive_Button, THE Clairtus_System SHALL set requires_human to TRUE for the active Transaction
3. WHEN requires_human becomes TRUE, THE Clairtus_System SHALL halt all automated responses for that Transaction
4. WHEN requires_human becomes TRUE, THE Clairtus_System SHALL send notification to Admin_Panel with Transaction details
5. WHEN requires_human becomes TRUE, THE Clairtus_System SHALL respond to user "🆘 Demande d'assistance enregistrée. Un agent Clairtus vous contactera dans les 2 heures."
6. WHEN requires_human is TRUE, THE Clairtus_System SHALL reject all automated state transitions for that Transaction

### Requirement 8: Payout Wallet Limit Handling

**User Story:** As a Vendor, I want to be notified when my Mobile Money wallet limit prevents payout, so that I can clear space and retry the transaction.

#### Acceptance Criteria

1. WHEN PawaPay /v1/payouts returns RECEIVER_LIMIT_EXCEEDED error, THE Clairtus_System SHALL transition Transaction status to PAYOUT_FAILED
2. WHEN Transaction status becomes PAYOUT_FAILED, THE Clairtus_System SHALL send Interactive_Button message to Vendor "Votre compte Mobile Money a atteint sa limite. Veuillez le vider, puis cliquez sur [Réessayer le paiement]"
3. WHEN Vendor clicks Réessayer le paiement button, THE Clairtus_System SHALL retry PawaPay /v1/payouts using the same Idempotency_Key
4. WHEN retry succeeds, THE Clairtus_System SHALL transition Transaction status to COMPLETED
5. IF retry fails 3 times, THEN THE Clairtus_System SHALL set requires_human to TRUE and notify Admin_Panel

### Requirement 9: MNO Network Timeout Recovery

**User Story:** As a Vendor, I want automatic payout retry when Mobile Network Operators experience downtime, so that I receive payment without manual intervention.

#### Acceptance Criteria

1. WHEN PawaPay /v1/payouts returns 503 Service Unavailable or timeout error, THE Clairtus_System SHALL transition Transaction status to PAYOUT_DELAYED
2. WHEN Transaction status becomes PAYOUT_DELAYED, THE Clairtus_System SHALL send message to Vendor "Code valide! Le réseau Mobile Money est lent. Vos fonds sont sécurisés et seront transférés automatiquement dès le retour du réseau."
3. THE CRON_Job SHALL execute every 15 minutes
4. WHEN CRON_Job executes, THE Clairtus_System SHALL select all Transactions with status PAYOUT_DELAYED
5. WHEN CRON_Job finds PAYOUT_DELAYED Transactions, THE Clairtus_System SHALL retry PawaPay /v1/payouts using the original Idempotency_Key
6. WHEN retry succeeds, THE Clairtus_System SHALL transition Transaction status to COMPLETED
7. IF Transaction remains in PAYOUT_DELAYED for 24 hours, THEN THE Clairtus_System SHALL set requires_human to TRUE

### Requirement 10: Transaction Time-to-Live Enforcement

**User Story:** As a Buyer, I want automatic refund if the vendor fails to deliver within 72 hours, so that my funds are not held indefinitely.

#### Acceptance Criteria

1. THE CRON_Job SHALL execute hourly to check for expired Transactions
2. WHEN CRON_Job executes, THE Clairtus_System SHALL select all Transactions where status is SECURED and NOW() exceeds expires_at
3. WHEN an expired Transaction is found, THE Clairtus_System SHALL call PawaPay Refund API requesting Base_Amount only
4. THE PawaPay refund request SHALL use Transaction id as Idempotency_Key
5. WHEN PawaPay confirms successful refund, THE Clairtus_System SHALL transition Transaction status to CANCELLED
6. WHEN TTL expiration causes CANCELLED status, THE Clairtus_System SHALL increment cancelled_transactions for the Vendor in users table
7. WHEN TTL expiration causes CANCELLED status, THE Clairtus_System SHALL notify Buyer "⏰ Délai expiré. Vos fonds ont été remboursés (hors frais MNO). Le vendeur n'a pas livré dans les 72 heures."
8. WHEN TTL expiration causes CANCELLED status, THE Clairtus_System SHALL notify Vendor "❌ Transaction annulée. Vous n'avez pas livré dans les 72 heures. Ceci affecte votre score de confiance."
9. THE refund SHALL NOT include MNO_Fee (non-refundable)

### Requirement 11: Float Depletion Protection

**User Story:** As the Clairtus_System operator, I want to block new transactions when payout wallet balance is critically low, so that I can prevent failed payouts due to insufficient funds.

#### Acceptance Criteria

1. WHEN a user attempts to initiate a Transaction, THE Clairtus_System SHALL query PawaPay /v1/balances API
2. WHEN PawaPay Payout Wallet balance is less than 500 USD, THE Clairtus_System SHALL reject Transaction creation
3. WHEN Transaction creation is rejected due to low Float, THE Clairtus_System SHALL respond "Clairtus est actuellement en maintenance technique pour garantir la liquidité. Réessayez plus tard."
4. WHEN Float drops below 500 USD, THE Clairtus_System SHALL send alert to Admin_Panel
5. WHEN Float is restored above 500 USD, THE Clairtus_System SHALL resume accepting new Transactions

### Requirement 12: Webhook Security Validation

**User Story:** As the Clairtus_System, I want to validate all incoming webhooks, so that I can prevent unauthorized state changes and protect transaction integrity.

#### Acceptance Criteria

1. WHEN Meta_WhatsApp_API webhook is received, THE Clairtus_System SHALL validate X-Hub-Signature-256 header against Meta App Secret
2. WHEN X-Hub-Signature-256 validation fails, THE Clairtus_System SHALL reject the webhook with HTTP 401 Unauthorized
3. WHEN PawaPay_API webhook is received, THE Clairtus_System SHALL validate signature using PawaPay signature verification method
4. WHEN PawaPay signature validation fails, THE Clairtus_System SHALL reject the webhook with HTTP 401 Unauthorized
5. WHEN webhook validation succeeds, THE Clairtus_System SHALL process the webhook payload

### Requirement 13: Trust Score Display

**User Story:** As a Buyer or Vendor, I want to see my counterparty's transaction history, so that I can make informed decisions about proceeding with the escrow.

#### Acceptance Criteria

1. WHEN displaying Trust_Score, THE Clairtus_System SHALL query successful_transactions and cancelled_transactions from users table
2. THE Trust_Score SHALL be formatted as "🟢 [X] ventes réussies | ❌ [Y] annulations"
3. WHEN a user has no transaction history, THE Trust_Score SHALL display "🆕 Nouveau utilisateur - Aucun historique"
4. THE Trust_Score SHALL be included in all INITIATED status Interactive_Button messages
5. THE Trust_Score calculation SHALL complete within 500 milliseconds

### Requirement 14: Admin Panel Transaction Management

**User Story:** As an Admin, I want to view and manage all transactions through a web interface, so that I can manually intervene when automated logic fails.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display all Transactions with columns: id, status, Buyer phone, Vendor phone, Base_Amount, created_at, expires_at
2. WHERE Admin_Panel is accessed, THE Admin_Panel SHALL provide status filtering options for all Transaction states
3. WHEN Admin selects a Transaction, THE Admin_Panel SHALL display full Transaction details including Secret_PIN and requires_human flag
4. WHERE Admin_Panel is accessed, THE Admin_Panel SHALL provide "Force Refund" button for Transactions in SECURED or PAYOUT_FAILED status
5. WHERE Admin_Panel is accessed, THE Admin_Panel SHALL provide "Force Payout" button for Transactions in SECURED or PAYOUT_FAILED status
6. WHERE Admin_Panel is accessed, THE Admin_Panel SHALL provide "Resume Automation" button for Transactions with requires_human TRUE
7. WHEN Admin clicks Force Refund, THE Admin_Panel SHALL call PawaPay Refund API and transition Transaction to CANCELLED
8. WHEN Admin clicks Force Payout, THE Admin_Panel SHALL call PawaPay Payout API and transition Transaction to COMPLETED
9. WHEN Admin clicks Resume Automation, THE Admin_Panel SHALL set requires_human to FALSE
10. WHEN Admin resolves a PIN_FAILED_LOCKED transaction, THE Admin_Panel MUST force either Refund or Payout to close the transaction

### Requirement 15: Admin Panel Custom Messaging

**User Story:** As an Admin, I want to send custom WhatsApp messages to users, so that I can provide personalized support for escalated issues.

#### Acceptance Criteria

1. WHERE Admin_Panel is accessed, THE Admin_Panel SHALL provide a message composition interface with recipient phone number and message text fields
2. WHEN Admin submits a custom message, THE Admin_Panel SHALL call Meta_WhatsApp_API to send the message
3. WHEN custom message is sent, THE Admin_Panel SHALL log the message in a messages_log table with timestamp and admin_id
4. THE custom message interface SHALL support message templates for common scenarios
5. WHEN custom message fails to send, THE Admin_Panel SHALL display error message and retry option

### Requirement 16: Database Schema Enforcement

**User Story:** As the Clairtus_System, I want to enforce data integrity constraints at the database level, so that invalid states cannot be persisted.

#### Acceptance Criteria

1. THE users table SHALL enforce phone_number as PRIMARY KEY in E164_Format
2. THE transactions table SHALL enforce currency CHECK constraint allowing only 'USD'
3. THE transactions table SHALL enforce status as NOT NULL
4. THE transactions table SHALL enforce Base_Amount as DECIMAL(10,2) NOT NULL
5. THE transactions table SHALL enforce FOREIGN KEY constraints on seller_phone and buyer_phone referencing users.phone_number
6. THE transactions table SHALL enforce UNIQUE constraint on pawapay_deposit_id
7. THE transactions table SHALL enforce UNIQUE constraint on pawapay_payout_id
8. THE transactions table SHALL automatically set created_at to NOW() on row creation
9. THE transactions table SHALL automatically set expires_at to NOW() + 72 hours on row creation

### Requirement 17: Idempotency Key Management

**User Story:** As the Clairtus_System, I want to use Transaction UUID as Idempotency_Key for all PawaPay API calls, so that network failures cannot cause duplicate charges or payouts.

#### Acceptance Criteria

1. WHEN calling PawaPay /v1/deposits, THE Clairtus_System SHALL pass Transaction id as Idempotency_Key
2. WHEN calling PawaPay /v1/payouts, THE Clairtus_System SHALL pass Transaction id as Idempotency_Key
3. WHEN calling PawaPay Refund API, THE Clairtus_System SHALL pass Transaction id as Idempotency_Key
4. WHEN PawaPay returns duplicate request error, THE Clairtus_System SHALL treat it as successful and proceed with state transition
5. THE Idempotency_Key SHALL remain constant across all retry attempts for the same Transaction

### Requirement 18: Message Parsing and Validation

**User Story:** As the Clairtus_System, I want to parse and validate user input messages, so that I can extract transaction parameters reliably.

#### Acceptance Criteria

1. THE Clairtus_System SHALL parse "Vente [Montant] USD [Article] au [Numéro]" using regex pattern
2. THE Clairtus_System SHALL parse "Achat [Montant] USD [Article] au [Numéro Vendeur]" using regex pattern
3. WHEN parsing succeeds, THE Clairtus_System SHALL extract Montant as Base_Amount, Article as item_description, and Numéro as counterparty phone
4. WHEN parsing fails, THE Clairtus_System SHALL respond "Format invalide. Utilisez: Vente [Montant] USD [Article] au [Numéro]"
5. WHEN Base_Amount is less than 1 USD, THE Clairtus_System SHALL reject with message "Montant minimum: 1 USD"
6. WHEN Base_Amount exceeds 2500 USD, THE Clairtus_System SHALL reject with message "Montant maximum: 2500 USD"
7. WHEN item_description exceeds 200 characters, THE Clairtus_System SHALL truncate to 200 characters

### Requirement 19: Interactive Button Implementation

**User Story:** As a Buyer or Vendor, I want to interact with the bot using clickable buttons, so that I can avoid typos and experience an institutional interface.

#### Acceptance Criteria

1. THE Clairtus_System SHALL use Meta Interactive Message API for all user choice prompts
2. WHEN presenting ACCEPTER/REFUSER choice, THE Clairtus_System SHALL create Interactive_Button with two button components
3. WHEN user clicks Interactive_Button, THE Clairtus_System SHALL receive button payload via webhook
4. THE Interactive_Button payload SHALL include Transaction id for state lookup
5. WHEN Interactive_Button is clicked, THE Clairtus_System SHALL respond within 2 seconds
6. WHERE AIDE option is available, THE Interactive_Button SHALL include AIDE as third button option

### Requirement 20: User Account Creation

**User Story:** As a new user, I want my account to be automatically created when I first interact with Clairtus, so that I can start transacting immediately.

#### Acceptance Criteria

1. WHEN a phone number is not found in users table, THE Clairtus_System SHALL create a new user row
2. THE new user row SHALL set successful_transactions to 0
3. THE new user row SHALL set cancelled_transactions to 0
4. THE new user row SHALL set is_suspended to FALSE
5. THE new user row SHALL set created_at to NOW()
6. WHEN user account is created, THE Clairtus_System SHALL send welcome message "Bienvenue sur Clairtus! Votre compte est créé. Vous pouvez maintenant acheter et vendre en toute sécurité."

### Requirement 21: Fee Calculation and Storage

**User Story:** As the Clairtus_System, I want to calculate and store all fees at transaction creation, so that fee changes do not affect in-flight transactions.

#### Acceptance Criteria

1. WHEN Transaction is created, THE Clairtus_System SHALL calculate MNO_Fee as Base_Amount multiplied by 0.015
2. WHEN Transaction is created, THE Clairtus_System SHALL calculate Clairtus_Fee as Base_Amount multiplied by 0.025
3. THE MNO_Fee SHALL be added to deposit amount requested from Buyer
4. THE Clairtus_Fee SHALL be deducted from payout amount sent to Vendor
5. THE Clairtus_Fee SHALL be stored in clairtus_fee column at Transaction creation
6. THE fee calculation SHALL round to 2 decimal places

### Requirement 22: Transaction Status Audit Trail

**User Story:** As an Admin, I want to track all status changes for a transaction, so that I can debug issues and understand transaction lifecycle.

#### Acceptance Criteria

1. THE Clairtus_System SHALL create a transaction_status_log table
2. WHEN Transaction status changes, THE Clairtus_System SHALL insert a row in transaction_status_log with transaction_id, old_status, new_status, changed_at, and reason
3. THE transaction_status_log SHALL be queryable by transaction_id
4. WHERE Admin_Panel displays Transaction details, THE Admin_Panel SHALL show complete status history
5. THE status change logging SHALL not block the primary state transition

### Requirement 23: PawaPay Balance Monitoring

**User Story:** As an Admin, I want to monitor PawaPay wallet balances in real-time, so that I can proactively manage float and prevent service disruption.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display current PawaPay Payout Wallet balance
2. THE Admin_Panel SHALL display current PawaPay Collection Wallet balance
3. THE Admin_Panel SHALL refresh balance display every 60 seconds
4. WHEN Payout Wallet balance drops below 1000 USD, THE Admin_Panel SHALL display warning indicator
5. WHEN Payout Wallet balance drops below 500 USD, THE Admin_Panel SHALL display critical alert
6. THE balance query SHALL call PawaPay /v1/balances API

### Requirement 24: Error Logging and Monitoring

**User Story:** As a Developer, I want comprehensive error logging for all system failures, so that I can diagnose and fix issues quickly.

#### Acceptance Criteria

1. WHEN PawaPay API call fails, THE Clairtus_System SHALL log error with transaction_id, API endpoint, request payload, response status, and error message
2. WHEN Meta_WhatsApp_API call fails, THE Clairtus_System SHALL log error with phone_number, message type, and error message
3. WHEN webhook validation fails, THE Clairtus_System SHALL log error with source IP, webhook type, and validation failure reason
4. WHEN database query fails, THE Clairtus_System SHALL log error with query text and error message
5. THE error logs SHALL be queryable by transaction_id and timestamp
6. THE error logs SHALL be accessible from Admin_Panel

### Requirement 25: Rate Limiting and Abuse Prevention

**User Story:** As the Clairtus_System operator, I want to prevent spam and abuse, so that legitimate users have reliable service.

#### Acceptance Criteria

1. WHEN a user initiates more than 5 Transactions within 1 hour, THE Clairtus_System SHALL reject additional attempts with message "Limite atteinte. Veuillez réessayer dans 1 heure."
2. WHEN a user has 3 or more Transactions in PIN_FAILED_LOCKED status, THE Clairtus_System SHALL set is_suspended to TRUE
3. WHEN is_suspended is TRUE, THE Clairtus_System SHALL reject all Transaction initiation attempts with message "Votre compte est suspendu. Contactez le support."
4. WHERE Admin_Panel is accessed, THE Admin_Panel SHALL provide interface to unsuspend users
5. THE rate limiting SHALL reset hourly



### Requirement 26: Transaction Cancellation by User

**User Story:** As a Buyer or Vendor, I want to cancel a transaction before funding is secured, so that I can exit if circumstances change.

#### Acceptance Criteria

1. WHILE Transaction status is INITIATED or PENDING_FUNDING, THE Clairtus_System SHALL accept "ANNULER" command from either party
2. WHEN user sends "ANNULER", THE Clairtus_System SHALL transition Transaction status to CANCELLED
3. WHEN Transaction is cancelled by Buyer in PENDING_FUNDING status, THE Clairtus_System SHALL not increment cancelled_transactions
4. WHEN Transaction is cancelled by Vendor in INITIATED or PENDING_FUNDING status, THE Clairtus_System SHALL increment cancelled_transactions for Vendor
5. WHEN Transaction is cancelled, THE Clairtus_System SHALL notify both parties "Transaction annulée"
6. WHILE Transaction status is SECURED or later, THE Clairtus_System SHALL reject "ANNULER" command and respond "Transaction en cours. Utilisez AIDE pour contacter le support."

### Requirement 27: Webhook Retry Logic

**User Story:** As the Clairtus_System, I want to handle webhook delivery failures gracefully, so that temporary network issues do not cause transaction failures.

#### Acceptance Criteria

1. WHEN processing a PawaPay webhook, THE Clairtus_System SHALL return HTTP 200 within 5 seconds
2. IF webhook processing fails, THEN THE Clairtus_System SHALL return HTTP 500 to trigger PawaPay retry
3. WHEN receiving duplicate webhook, THE Clairtus_System SHALL check if state transition already occurred
4. WHEN state transition already occurred, THE Clairtus_System SHALL return HTTP 200 without reprocessing
5. THE webhook handler SHALL use database transactions to ensure atomic state changes

### Requirement 28: Phone Number Normalization

**User Story:** As the Clairtus_System, I want to normalize all phone numbers to E164_Format, so that user matching and messaging work reliably.

#### Acceptance Criteria

1. WHEN receiving a phone number, THE Clairtus_System SHALL remove all spaces, dashes, and parentheses
2. WHEN phone number starts with 0 and has 10 digits, THE Clairtus_System SHALL remove leading 0 and prepend +243
3. WHEN phone number starts with 243 and has 12 digits, THE Clairtus_System SHALL prepend +
4. WHEN phone number starts with +243 and has 13 characters, THE Clairtus_System SHALL use as-is
5. WHEN phone number does not match any normalization pattern, THE Clairtus_System SHALL reject with error message
6. THE normalized phone number SHALL be stored in E164_Format in database

### Requirement 29: System Health Monitoring

**User Story:** As an Admin, I want to monitor system health metrics, so that I can detect and respond to operational issues.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display count of Transactions by status in last 24 hours
2. THE Admin_Panel SHALL display average time from INITIATED to COMPLETED for last 100 Transactions
3. THE Admin_Panel SHALL display count of Transactions with requires_human TRUE
4. THE Admin_Panel SHALL display count of failed PawaPay API calls in last 24 hours
5. THE Admin_Panel SHALL display count of failed Meta_WhatsApp_API calls in last 24 hours
6. WHERE system health metrics exceed thresholds, THE Admin_Panel SHALL display alert indicators

