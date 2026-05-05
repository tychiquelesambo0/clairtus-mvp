# 📱 COMPLETE WHATSAPP MESSAGES AUDIT
**Date:** May 5, 2026  
**Purpose:** Comprehensive list of ALL WhatsApp messages sent by Clairtus bot  
**Status:** Ready for founder review and bulletproofing

---

## 📋 TABLE OF CONTENTS

1. [Identity Capture Flow](#1-identity-capture-flow)
2. [Guided Transaction Flow](#2-guided-transaction-flow)
3. [Transaction Lifecycle Messages](#3-transaction-lifecycle-messages)
4. [Payment & PIN Messages](#4-payment--pin-messages)
5. [Error & Validation Messages](#5-error--validation-messages)
6. [Transaction Management](#6-transaction-management)
7. [Cron Job Automated Messages](#7-cron-job-automated-messages)
8. [Fallback & Help Messages](#8-fallback--help-messages)
9. [Interactive Button Messages](#9-interactive-button-messages)

---

## 1. IDENTITY CAPTURE FLOW

### 1.1 First Name Request
**Context:** User's first interaction, no identity on file  
**Trigger:** New user sends any message  
```
👋 *Bienvenue sur Clairtus*

Quel est votre prénom ?
```

### 1.2 First Name Invalid
**Context:** User entered invalid first name (special chars, too short, etc.)  
**Trigger:** Invalid first name format  
```
❌ *Prénom invalide*

Envoyez uniquement votre prénom.
Exemple : Patrick
```

### 1.3 Last Name Request
**Context:** Valid first name received  
**Trigger:** After first name validated  
```
Merci 🙏

Votre nom de famille ?
```

### 1.4 Last Name Invalid
**Context:** User entered invalid last name  
**Trigger:** Invalid last name format  
```
❌ *Nom invalide*

Envoyez uniquement votre nom de famille.
Exemple : Mbuyi
```

### 1.5 Identity Capture Error
**Context:** Technical error during identity save  
**Trigger:** Database error  
```
⚠️ *Erreur temporaire*

Réessayez maintenant.
```

### 1.6 Identity Saved & Resume
**Context:** Identity successfully saved, resuming pending action  
**Trigger:** After last name validated  
```
✅ *Profil enregistré*

On reprend où vous étiez.
```

### 1.7 Identity Draft Expired
**Context:** User returns after 72h+ of inactivity during identity capture  
**Trigger:** Expired identity draft detected  
```
⏰ *Session expirée*

Recommençons. Quel est votre prénom ?
```

---

## 2. GUIDED TRANSACTION FLOW

### 2.1 Welcome Menu (New User)
**Context:** User says "BONJOUR" (no name on file)  
**Trigger:** Greeting detected  
**Type:** Interactive Buttons  
```
👋 Bonjour et bienvenue chez Clairtus.

Clairtus sécurise vos transactions entre acheteur et vendeur :
• l'acheteur paie en sécurité
• le vendeur est payé après confirmation
• tout est tracé pour protéger les deux parties

Que souhaitez-vous faire aujourd'hui ?

[VENDRE] [ACHETER]
```

### 2.2 Welcome Menu (Returning User)
**Context:** User says "BONJOUR" (has name on file)  
**Trigger:** Greeting detected  
**Type:** Interactive Buttons  
```
👋 Bonjour {firstName} {lastName}, heureux de vous revoir sur Clairtus.

Clairtus sécurise vos transactions entre acheteur et vendeur :
• l'acheteur paie en sécurité
• le vendeur est payé après confirmation
• tout est tracé pour protéger les deux parties

Que souhaitez-vous faire aujourd'hui ?

[VENDRE] [ACHETER]
```

### 2.3 SELL Flow - Item Request
**Context:** User clicked "VENDRE" button  
**Trigger:** FLOW|SELL button or "VENDRE" text  
```
📦 *Mode VENTE activé*

Quel article vendez-vous ?
```

### 2.4 BUY Flow - Item Request
**Context:** User clicked "ACHETER" button  
**Trigger:** FLOW|BUY button or "ACHETER" text  
```
🛒 *Mode ACHAT activé*

Quel article achetez-vous ?
```

### 2.5 Item Description Invalid
**Context:** User entered invalid item description (too short, special chars)  
**Trigger:** Invalid item format  
```
❌ *Description invalide*

Décrivez l'article en quelques mots.
Exemple : iPhone 13 Pro
```

### 2.6 Price Request (SELL)
**Context:** Valid item description received in SELL mode  
**Trigger:** After item validated  
```
💰 *Article : {itemDescription}*

À quel prix (en USD) ?
```

### 2.7 Price Request (BUY)
**Context:** Valid item description received in BUY mode  
**Trigger:** After item validated  
```
💰 *Article : {itemDescription}*

Quel est le prix convenu (en USD) ?
```

### 2.8 Amount Invalid - Out of Range
**Context:** User entered amount outside allowed limits  
**Trigger:** Amount < min or > max  
```
❌ *Montant invalide*

Minimum : {minAmount} USD
Maximum : {maxAmount} USD

Réessayez avec un montant valide.
```

### 2.9 Amount Invalid - Format Error
**Context:** User entered non-numeric or badly formatted amount  
**Trigger:** Invalid number format  
```
❌ *Format invalide*

Entrez uniquement le montant en chiffres.
Exemple : 150 ou 150.50
```

### 2.10 Counterparty Phone Request (SELL)
**Context:** Valid amount received in SELL mode  
**Trigger:** After amount validated  
```
📞 *Article : {itemDescription}*
💵 *Prix : {amount} USD*

Numéro de téléphone de l'acheteur ?
(Format : +243...)
```

### 2.11 Counterparty Phone Request (BUY)
**Context:** Valid amount received in BUY mode  
**Trigger:** After amount validated  
```
📞 *Article : {itemDescription}*
💵 *Prix : {amount} USD*

Numéro de téléphone du vendeur ?
(Format : +243...)
```

### 2.12 Phone Number Invalid
**Context:** User entered invalid phone number  
**Trigger:** Phone format validation failed  
```
❌ *Numéro invalide*

Format attendu : +243XXXXXXXXX (9 chiffres)
Exemple : +243812345678
```

### 2.13 Self-Transaction Blocked
**Context:** User entered their own phone number as counterparty  
**Trigger:** Initiator phone = counterparty phone  
```
❌ *Erreur*

Vous ne pouvez pas créer une transaction avec vous-même.
Vérifiez le numéro de la contrepartie.
```

### 2.14 Guided Flow Expired
**Context:** User returns after 72h+ of inactivity during guided flow  
**Trigger:** Expired guided draft detected  
```
⏰ *Session expirée*

Votre brouillon a expiré.
Envoyez BONJOUR pour recommencer.
```

### 2.15 Guided Flow Restart
**Context:** User types "NOUVELLE TRANSACTION" or similar during guided flow  
**Trigger:** Restart keyword detected  
```
🔄 *Brouillon effacé*

Envoyez BONJOUR pour recommencer.
```

---

## 3. TRANSACTION LIFECYCLE MESSAGES

### 3.1 Transaction Created - Seller Notification (Template)
**Context:** Transaction successfully created, notifying seller  
**Trigger:** State machine creates transaction  
**Type:** WhatsApp Template (if configured)  
**Template Name:** `{WHATSAPP_TRANSACTION_ALERT_TEMPLATE_NAME}`  
**Language:** `{WHATSAPP_TRANSACTION_ALERT_TEMPLATE_LANG}`

### 3.2 Transaction Created - Buyer Notification (Interactive Buttons)
**Context:** Transaction successfully created, notifying buyer  
**Trigger:** State machine creates transaction  
**Type:** Interactive Buttons  
```
🛡️ Clairtus | Nouvelle transaction

📦 Article : {itemDescription}
💰 Montant : {baseAmount} USD

Le vendeur {sellerPhone} attend votre réponse.

Acceptez-vous cette transaction sécurisée ?

[ACCEPTER] [REFUSER] [AIDE]
```

### 3.3 Transaction Created - Fallback Text (if buttons fail)
**Context:** Interactive buttons failed to send  
**Trigger:** Button dispatch failed  
**Type:** Text Message  
```
🛡️ Clairtus | Nouvelle transaction

📦 Article : {itemDescription}
💰 Montant : {baseAmount} USD

Le vendeur {sellerPhone} attend votre réponse.

Pour accepter : ACCEPTER {transactionId}
Pour refuser : REFUSER {transactionId}
Pour assistance : AIDE {transactionId}
```

### 3.4 Buyer Accepted - Deposit Initiated
**Context:** Buyer clicked "ACCEPTER" button  
**Trigger:** BUTTON_ACCEPT intent processed  
```
✅ *Demande acceptée*

Initiation du paiement sécurisé en cours.
Vous allez recevoir une demande Mobile Money.
```

### 3.5 Buyer Rejected - Transaction Cancelled
**Context:** Buyer clicked "REFUSER" button  
**Trigger:** BUTTON_REJECT intent processed  
```
❌ *Transaction refusée*

La transaction est annulée.
Le vendeur en est informé.
```

### 3.6 Seller Notified of Rejection
**Context:** Buyer rejected transaction  
**Trigger:** After buyer rejection  
```
❌ *Transaction refusée*

L'acheteur a refusé la transaction.
```

---

## 4. PAYMENT & PIN MESSAGES

### 4.1 Payment Secured - Buyer Receives PIN
**Context:** PawaPay deposit succeeded  
**Trigger:** `pawapay-webhook` deposit success event  
```
🔐 *Paiement sécurisé*

Votre code PIN : *{pin}*

⚠️ Donnez-le UNIQUEMENT à la livraison
Ne le partagez JAMAIS par téléphone
```

### 4.2 Payment Secured - Seller Instructions
**Context:** PawaPay deposit succeeded  
**Trigger:** `pawapay-webhook` deposit success event  
```
✅ *Fonds sécurisés* : {baseAmount} USD

1️⃣ Livrez l'article
2️⃣ Demandez le code PIN
3️⃣ Envoyez-le ici pour recevoir votre paiement
```

### 4.3 Payment Failed - Buyer Notification
**Context:** PawaPay deposit failed  
**Trigger:** `pawapay-webhook` deposit failed event  
```
❌ *Paiement échoué*

Transaction annulée.
Réessayez quand vous voulez.
```

### 4.4 Payment Failed - Seller Notification
**Context:** PawaPay deposit failed  
**Trigger:** `pawapay-webhook` deposit failed event  
```
❌ *Paiement échoué*

Transaction annulée.
L'acheteur peut réessayer.
```

### 4.5 PIN Submitted - Verification in Progress
**Context:** Seller submitted 4-digit PIN  
**Trigger:** SUBMIT_PIN intent detected  
```
🔐 Code PIN reçu.

Vérification en cours.
```

### 4.6 PIN Correct - Payout Initiated
**Context:** PIN matched, payout initiated  
**Trigger:** State machine validates PIN  
```
✅ *Code PIN validé*

Transfert en cours vers votre Mobile Money.
```

### 4.7 PIN Incorrect - Retry Allowed
**Context:** PIN wrong, attempts remaining  
**Trigger:** PIN validation failed, attempts < 3  
```
❌ *Code PIN incorrect*

Il vous reste {remainingAttempts} essai(s).
Réessayez avec le bon code.
```

### 4.8 PIN Failed - Transaction Locked
**Context:** 3 failed PIN attempts  
**Trigger:** PIN validation failed, attempts = 3  
```
🔒 *Transaction verrouillée*

Trop de tentatives incorrectes.
Contactez l'assistance : AIDE
```

### 4.9 Payout Completed - Seller Notification 1
**Context:** PawaPay payout succeeded  
**Trigger:** `pawapay-webhook` payout success event  
```
🎉 *Paiement confirmé !*

Code PIN validé ✓
*{payoutAmount} USD* en route vers votre Mobile Money
```

### 4.10 Payout Completed - Seller Notification 2
**Context:** PawaPay payout succeeded (celebration message)  
**Trigger:** `pawapay-webhook` payout success event  
```
👏 *Vente réussie !*

{itemDescription} vendu avec succès.
À bientôt sur Clairtus 🇨🇩
```

### 4.11 Payout Completed - Buyer Notification 1
**Context:** PawaPay payout succeeded  
**Trigger:** `pawapay-webhook` payout success event  
```
✅ *Transaction terminée*

Le vendeur a été payé.
Merci d'utiliser Clairtus !
```

### 4.12 Payout Completed - Buyer Notification 2
**Context:** PawaPay payout succeeded (celebration message)  
**Trigger:** `pawapay-webhook` payout success event  
```
🥳 *Achat réussi !*

{itemDescription} acheté en toute sécurité.
À bientôt sur Clairtus 🇨🇩
```

### 4.13 Payout Failed - Seller Notification (Interactive Buttons)
**Context:** PawaPay payout failed  
**Trigger:** `payoutFlow` payout failed  
**Type:** Interactive Buttons  
```
⚠️ Le transfert n'a pas abouti car le compte Mobile Money semble proche de sa limite.

Libérez le solde ou utilisez un compte adapté, puis appuyez sur « RÉESSAYER ».

[RÉESSAYER] [AIDE]
```

### 4.14 Payout Delayed - Seller Reassurance
**Context:** Payout delayed (network issue)  
**Trigger:** `payoutFlow` payout delayed  
```
⏳ *Transfert en attente*

Retard réseau détecté.
Vos fonds restent sécurisés.
Nous relançons automatiquement.
```

---

## 5. ERROR & VALIDATION MESSAGES

### 5.1 Phone Number Format Error (Generic)
**Context:** User entered phone number in wrong format  
**Trigger:** Phone normalization failed  
```
❌ *Format de numéro invalide*

Utilisez le format international : +243XXXXXXXXX
Exemple : +243812345678
```

### 5.2 Non-French Message Rejected
**Context:** User sent message in non-French language  
**Trigger:** French language detection failed  
```
🇫🇷 *Français uniquement*

Merci d'envoyer votre message en français.
Exemple : Je veux vendre mon article à 150 USD au +243...
```

### 5.3 User Suspended
**Context:** User account is suspended  
**Trigger:** `isUserSuspended()` returns true  
```
🚫 *Compte suspendu*

Votre compte a été suspendu pour violation des conditions d'utilisation.
Contactez le support Clairtus pour plus d'informations.
```

### 5.4 Rate Limit Exceeded
**Context:** User exceeded message rate limit  
**Trigger:** Rate limiter triggered  
```
⏸️ *Trop de messages*

Patientez quelques secondes avant de réessayer.
```

### 5.5 Transaction Not Found
**Context:** User referenced invalid transaction ID  
**Trigger:** Transaction lookup failed  
```
❌ *Transaction introuvable*

Vérifiez la référence et réessayez.
Format : CLT-XXXXXXXX
```

### 5.6 Transaction Reference Help
**Context:** User sent malformed transaction reference  
**Trigger:** REFERENCE_HELP intent  
```
Je n'ai pas reconnu cette référence.

Format attendu : CLT-XXXXXXXX
Exemple : CLT-739BF311

Vous pouvez aussi envoyer : MES TRANSACTIONS
```

### 5.7 State Machine Error (Generic)
**Context:** State machine returned error  
**Trigger:** State machine API error  
```
⚠️ *Erreur technique*

Impossible de traiter votre demande.
Réessayez ou contactez l'assistance.
```

### 5.8 Deposit Initiation Failed
**Context:** Deposit API call failed  
**Trigger:** `initiateDepositForTransaction` failed  
```
⚠️ *Paiement indisponible*

Impossible d'initier le paiement pour le moment.
Réessayez dans quelques instants.
```

### 5.9 Deposit Limit Hint
**Context:** Deposit failed due to limit/balance issue  
**Trigger:** PawaPay error contains "limit" or "plafond"  
```
⚠️ Le paiement n'a pas pu être validé par l'opérateur (plafond ou solde). Vérifiez le compte Mobile Money puis utilisez RÉESSAYER.
```

### 5.10 Checkout URL Provided (Fallback)
**Context:** Deposit failed, checkout URL available  
**Trigger:** PawaPay returns checkout URL  
```
💳 *Paiement alternatif*

Cliquez ici pour finaliser le paiement :
{checkoutUrl}
```

### 5.11 Checkout URL Unavailable
**Context:** Deposit failed, no checkout URL  
**Trigger:** PawaPay error, no checkout URL  
```
⚠️ Paiement indisponible pour le moment sur ce numéro / cette configuration.

Contactez l'assistance Clairtus pour vérification.
```

---

## 6. TRANSACTION MANAGEMENT

### 6.1 List Transactions - Empty
**Context:** User sent "MES TRANSACTIONS" but has no transactions  
**Trigger:** LIST_TRANSACTIONS intent, 0 results  
```
📭 Vous n'avez pas encore de transaction.

Pour démarrer, envoyez : BONJOUR
```

### 6.2 List Transactions - With Results
**Context:** User sent "MES TRANSACTIONS" and has transactions  
**Trigger:** LIST_TRANSACTIONS intent, >0 results  
```
📚 Vos transactions récentes :

1) CLT-XXXXXXXX • Vendeur
{itemDescription} • {baseAmount} $
Statut : {status}

2) CLT-YYYYYYYY • Acheteur
{itemDescription} • {baseAmount} $
Statut : {status}

...

Pour voir le détail, envoyez simplement : CLT-XXXXXX
```

### 6.3 Transaction Detail
**Context:** User sent valid transaction reference  
**Trigger:** DETAIL_TRANSACTION intent  
```
📄 Détail CLT-XXXXXXXX

Rôle : Vendeur
Contrepartie : +243XXXXXXXXX
Article : {itemDescription}
Montant : {baseAmount} $
Statut : {status}

Action : {actionHint}
```

### 6.4 Cancel Transaction Request
**Context:** User sent "ANNULER" or "ANNULER {transactionId}"  
**Trigger:** CANCEL_TRANSACTION intent  
```
🛑 Demande d'annulation reçue.

Nous vérifions si la transaction peut encore être annulée.
```

### 6.5 Cancel Transaction - Counterparty Notified
**Context:** Transaction cancelled before payment  
**Trigger:** After cancellation processed  
```
ℹ️ La contrepartie a annulé la transaction avant confirmation du paiement.
```

### 6.6 Relaunch Counterparty Notification
**Context:** User requested to resend notification to counterparty  
**Trigger:** RELAUNCH_COUNTERPARTY intent  
```
🔄 *Relance en cours*

Nous renvoyons la notification à la contrepartie.
```

### 6.7 Counterparty Reminder Sent
**Context:** Seller requested reminder to buyer  
**Trigger:** RELAUNCH_COUNTERPARTY for INITIATED transaction  
```
🔔 Rappel Clairtus

Transaction en attente de votre réponse.

📦 Article : {itemDescription}
💰 Montant : {baseAmount} USD

Pour accepter : ACCEPTER {transactionId}
Pour refuser : REFUSER {transactionId}
Pour assistance : AIDE {transactionId}
```

---

## 7. CRON JOB AUTOMATED MESSAGES

### 7.1 TTL Expired - Buyer Didn't Accept (Seller Notified)
**Context:** Buyer didn't accept within 24h  
**Trigger:** `cron-jobs/ttl-enforcement` for INITIATED status  
```
⏰ *Délai expiré*

Transaction annulée.
L'acheteur n'a pas accepté à temps.
```

### 7.2 TTL Expired - No Delivery in 72h (Buyer Refunded)
**Context:** Seller didn't deliver within 72h  
**Trigger:** `cron-jobs/ttl-enforcement` for SECURED status  
```
⏰ *Délai expiré*

Pas de livraison en 72h.
💰 Remboursement effectué (hors frais opérateur)
```

### 7.3 TTL Expired - No Delivery in 72h (Seller Penalized)
**Context:** Seller didn't deliver within 72h  
**Trigger:** `cron-jobs/ttl-enforcement` for SECURED status  
```
❌ *Transaction annulée*

Pas de livraison en 72h.
⚠️ Impact sur votre score de confiance
```

### 7.4 Deposit Timeout - 30 Minutes (Buyer Notified)
**Context:** Buyer didn't pay within 30 minutes  
**Trigger:** `cron-jobs/deposit-timeout` for PENDING_FUNDING status  
```
⏱️ Délai dépassé (30 minutes).

Le paiement n'a pas été confirmé, la transaction est annulée.
```

### 7.5 Deposit Timeout - 30 Minutes (Seller Notified)
**Context:** Buyer didn't pay within 30 minutes  
**Trigger:** `cron-jobs/deposit-timeout` for PENDING_FUNDING status  
```
⏱️ Délai dépassé (30 minutes).

Le paiement de l'acheteur n'a pas été confirmé à temps.
La transaction est annulée.
```

### 7.6 Payout Retry - Technical Delay (Seller Notified)
**Context:** Payout delayed, manual intervention triggered  
**Trigger:** `cron-jobs/payout-retry` for PAYOUT_DELAYED status  
```
🆘 *Paiement en cours*

Retard technique détecté.
Notre équipe intervient maintenant.
```

---

## 8. FALLBACK & HELP MESSAGES

### 8.1 Unknown Message - No Active Transaction (Completed Last)
**Context:** User sent unrecognized message, last transaction was COMPLETED  
**Trigger:** UNKNOWN intent, no active tx, last status = COMPLETED  
```
✅ Votre dernière transaction est terminée.

Souhaitez-vous démarrer une nouvelle transaction ?
Si oui, écrivez juste : BONJOUR
```

### 8.2 Unknown Message - No Active Transaction (General)
**Context:** User sent unrecognized message, no active transaction  
**Trigger:** UNKNOWN intent, no active tx  
```
Je n'ai pas compris votre message.

Pour démarrer facilement :
• écrivez juste : BONJOUR
• puis choisissez VENDRE ou ACHETER

Pour annuler une transaction en attente : ANNULER
```

### 8.3 Unknown Message - INITIATED Transaction (Seller)
**Context:** User sent unrecognized message, has INITIATED transaction as seller  
**Trigger:** UNKNOWN intent, active tx status = INITIATED, user = seller  
```
📨 Transaction en cours.

Nous attendons la réponse de l'acheteur (ACCEPTER / REFUSER).
Vous pouvez aussi annuler avec ANNULER.
```

### 8.4 Unknown Message - INITIATED Transaction (Buyer)
**Context:** User sent unrecognized message, has INITIATED transaction as buyer  
**Trigger:** UNKNOWN intent, active tx status = INITIATED, user = buyer  
```
📨 Demande reçue pour {itemDescription}.

Utilisez les boutons ACCEPTER, REFUSER ou AIDE.
Vous pouvez aussi annuler avec ANNULER.
```

### 8.5 Unknown Message - PENDING_FUNDING Transaction (Seller)
**Context:** User sent unrecognized message, has PENDING_FUNDING transaction as seller  
**Trigger:** UNKNOWN intent, active tx status = PENDING_FUNDING, user = seller  
```
⏳ Transaction en financement.

Nous attendons la confirmation du paiement acheteur.
Vous pouvez encore annuler avec ANNULER.
```

### 8.6 Unknown Message - PENDING_FUNDING Transaction (Buyer)
**Context:** User sent unrecognized message, has PENDING_FUNDING transaction as buyer  
**Trigger:** UNKNOWN intent, active tx status = PENDING_FUNDING, user = buyer  
```
💳 Paiement en attente.

Validez la demande Mobile Money pour sécuriser la transaction.
Vous pouvez encore annuler avec ANNULER.
```

### 8.7 Unknown Message - SECURED Transaction (Seller)
**Context:** User sent unrecognized message, has SECURED transaction as seller  
**Trigger:** UNKNOWN intent, active tx status = SECURED, user = seller  
```
Vous avez le code PIN client ? Envoyez simplement les 4 chiffres.

Pour voir vos transactions, écrivez : MES TRANSACTIONS
Pour démarrer une nouvelle transaction, écrivez juste : BONJOUR
```

### 8.8 Unknown Message - SECURED Transaction (Buyer)
**Context:** User sent unrecognized message, has SECURED transaction as buyer  
**Trigger:** UNKNOWN intent, active tx status = SECURED, user = buyer  
```
Partagez votre code PIN uniquement au moment de la remise de l'article.

Pour voir vos transactions, écrivez : MES TRANSACTIONS
Pour démarrer une nouvelle transaction, écrivez juste : BONJOUR
```

### 8.9 Unknown Message - PAYOUT_DELAYED Transaction (Seller)
**Context:** User sent unrecognized message, has PAYOUT_DELAYED transaction as seller  
**Trigger:** UNKNOWN intent, active tx status = PAYOUT_DELAYED, user = seller  
```
⏳ Transfert en retard réseau.

Vos fonds restent sécurisés. Utilisez RÉESSAYER ou AIDE si besoin.
```

### 8.10 Unknown Message - PAYOUT_DELAYED Transaction (Buyer)
**Context:** User sent unrecognized message, has PAYOUT_DELAYED transaction as buyer  
**Trigger:** UNKNOWN intent, active tx status = PAYOUT_DELAYED, user = buyer  
```
⏳ Transfert vendeur en cours.

La transaction reste sécurisée pendant le traitement.
```

### 8.11 Unknown Message - PAYOUT_FAILED Transaction (Seller)
**Context:** User sent unrecognized message, has PAYOUT_FAILED transaction as seller  
**Trigger:** UNKNOWN intent, active tx status = PAYOUT_FAILED, user = seller  
```
⚠️ Le transfert a échoué.

Utilisez RÉESSAYER pour relancer, ou AIDE pour être assisté.
```

### 8.12 Unknown Message - PAYOUT_FAILED Transaction (Buyer)
**Context:** User sent unrecognized message, has PAYOUT_FAILED transaction as buyer  
**Trigger:** UNKNOWN intent, active tx status = PAYOUT_FAILED, user = buyer  
```
⚠️ Le transfert vendeur a rencontré un incident.

Nous traitons la reprise en priorité.
```

### 8.13 Unknown Message - PIN_FAILED_LOCKED Transaction
**Context:** User sent unrecognized message, transaction locked due to failed PINs  
**Trigger:** UNKNOWN intent, active tx status = PIN_FAILED_LOCKED  
```
🆘 Transaction verrouillée pour sécurité.

Utilisez AIDE pour contacter un agent Clairtus.
```

### 8.14 Unknown Message - Generic Fallback
**Context:** User sent unrecognized message, edge case  
**Trigger:** UNKNOWN intent, no specific context  
```
Je n'ai pas compris votre message.

Dites BONJOUR pour reprendre étape par étape.
```

### 8.15 Human Support Request Acknowledged
**Context:** User sent "AIDE" or clicked AIDE button  
**Trigger:** HUMAN_SUPPORT intent  
```
🆘 Demande d'assistance enregistrée.

Un agent Clairtus vous contactera sous 2 heures.
```

---

## 9. INTERACTIVE BUTTON MESSAGES

### 9.1 Pre-Payment Management Buttons (Buyer)
**Context:** Transaction in PENDING_FUNDING, buyer needs options  
**Trigger:** State machine sends interactive buttons  
**Type:** Interactive Buttons  
```
💳 *Paiement en attente*

Que souhaitez-vous faire ?

[PAYER MAINTENANT] [ANNULER] [AIDE]
```

### 9.2 Payout Retry Buttons (Seller)
**Context:** Payout failed, seller can retry  
**Trigger:** `payoutFlow` sends retry buttons  
**Type:** Interactive Buttons  
```
⚠️ Le transfert n'a pas abouti car le compte Mobile Money semble proche de sa limite.

Libérez le solde ou utilisez un compte adapté, puis appuyez sur « RÉESSAYER ».

[RÉESSAYER] [AIDE]
```

---

## 10. TEST MODE MESSAGES

### 10.1 Test Mode - Buyer PIN Notification
**Context:** Auto-payment bypass enabled (test mode)  
**Trigger:** `AUTO_MARK_PAYMENT_SECURED=true`  
```
🔐 Paiement confirmé (mode test).

Voici votre code PIN de livraison : {pin}

⚠️ Ne partagez ce code qu'au moment de la remise de l'article.
```

### 10.2 Test Mode - Seller Funds Notification
**Context:** Auto-payment bypass enabled (test mode)  
**Trigger:** `AUTO_MARK_PAYMENT_SECURED=true`  
```
✅ Paiement confirmé (mode test).

Fonds sécurisés : {baseAmount} USD.

Demandez le code PIN client puis envoyez-le ici pour lancer le transfert.
```

---

## 11. REFUND MESSAGES

### 11.1 Refund Completed - Buyer Notification
**Context:** Refund successfully processed  
**Trigger:** `pawapay-webhook` refund success event  
```
💰 *Remboursement effectué*

Vos fonds sont remboursés.
(Hors frais opérateur Mobile Money)
```

### 11.2 Refund Completed - Seller Notification
**Context:** Refund successfully processed  
**Trigger:** `pawapay-webhook` refund success event  
```
❌ *Transaction annulée*

L'acheteur a été remboursé.
Cela impacte votre score de confiance.
```

---

## 📊 SUMMARY STATISTICS

**Total Message Categories:** 11  
**Total Unique Messages:** 90+  
**Languages:** French (100%)  
**Message Types:**
- Text Messages: ~75
- Interactive Button Messages: ~10
- Template Messages: ~5

**Tone:**
- Professional ✅
- Concise ✅
- Emoji-enhanced ✅
- Action-oriented ✅

---

## ✅ NEXT STEPS FOR FOUNDER

1. **Review each message** for:
   - Clarity
   - Tone
   - Accuracy
   - French grammar/spelling
   - Emoji appropriateness

2. **Test scenarios** to verify:
   - Message triggers correctly
   - Variables populate correctly
   - User understands next action

3. **Flag any issues** for immediate correction

4. **Approve final copy** before production launch

---

**Document prepared by:** Cascade (Staff-Level Cloud Architect)  
**Date:** May 5, 2026, 10:50 PM UTC+02:00  
**Status:** Ready for founder review
