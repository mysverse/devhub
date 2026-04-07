---
title: "Payment Flow"
version: "1.0.0"
type: "PAYMENT_FLOW"
---

# Payment Flow

This page explains how payments work on the MYSverse DevHub platform — from completing a task to receiving your payout.

## Payment Lifecycle

When a developer completes a task on Linear, the platform automatically creates a transaction and routes it to the appropriate payment provider.

```mermaid
flowchart TD
    A[Developer completes<br/>Linear issue] --> B[Linear webhook<br/>received]
    B --> C{PPT label &<br/>estimate set?}
    C -->|No| D[Ignored]
    C -->|Yes| E[Transaction created<br/>amount = estimate x 20 MYR]
    E --> F{Within weekly<br/>credit limit?}
    F -->|No| G[Pending manual<br/>admin approval]
    F -->|Yes| H[Auto-payout<br/>initiated]
    H --> I{Payout routing}
    G --> J[Admin reviews &<br/>processes manually]
    J --> K[Paid]
    I --> K
```

### How amounts are calculated

- Each Linear issue has a complexity estimate (1-5 points)
- Payment amount = estimate points x RM 20 (MYR)
- For Robux payouts, the amount is converted at the applicable rate

## Payout Routing

The system automatically selects the best payment provider based on your currency, payment method, and account configuration.

```mermaid
flowchart TD
    A[Auto-payout<br/>initiated] --> B{Currency?}
    B -->|ROBUX| C{Roblox account<br/>linked?}
    C -->|Yes| D[Roblox group<br/>payout]
    C -->|No| E[Manual processing]
    B -->|MYR| F{Payment method<br/>type?}
    F -->|Bank account| G{Bank supported<br/>by Billplz?}
    G -->|Yes| H[Billplz FPX<br/>disbursement]
    G -->|No| I{Bank supported<br/>by Xendit?}
    I -->|Yes| J[Xendit bank<br/>disbursement]
    I -->|No| E
    F -->|eWallet| K{Auto-payout<br/>enabled & KYC<br/>approved?}
    K -->|Yes| L[Xendit eWallet<br/>disbursement]
    K -->|No| E
    H --> M[Paid]
    J --> M
    L --> M
    D --> M
    E --> N[Admin processes<br/>manually]
    N --> M
```

### Payment providers

| Provider | Currency | Methods | Type |
|---|---|---|---|
| **Billplz** | MYR | FPX bank transfers (20 supported banks) | Automatic |
| **Xendit** | MYR | Bank transfers (22 banks) + eWallets (TnG, GrabPay, etc.) | Automatic |
| **Roblox** | ROBUX | Roblox group payout | Automatic |
| **Manual** | Any | Admin processes via bank transfer, PayPal, etc. | Manual |

### eWallet automatic payouts

eWallet payouts (TnG E-Wallet, GrabPay, Boost, etc.) through Xendit require:

1. **Identity verification (KYC)** — a one-time process where you upload your government ID and a selfie
2. **Auto-payout opt-in** — you must explicitly enable automatic payouts in your settings

Without these, your eWallet payouts are processed manually by an administrator. See our [AML/KYC Policy](/policy/aml-kyc) for details on the verification process.

## KYC Verification Flow

If you choose to enable automatic eWallet payouts, here is the verification process:

```mermaid
flowchart TD
    A[User selects eWallet<br/>payment method] --> B[Saves payment<br/>settings]
    B --> C[Tries to enable<br/>auto-payout toggle]
    C --> D{KYC status?}
    D -->|Not started| E[Start Verification<br/>button shown]
    D -->|Approved| F[Toggle enabled<br/>auto-payouts active]
    D -->|Rejected| G[Rejection reason shown<br/>Resubmit button]
    D -->|Pending| H[Under review message<br/>toggle disabled]
    D -->|Expired| I[Expiry message<br/>Resubmit button]
    E --> J[User uploads<br/>ID + selfie]
    G --> J
    I --> J
    J --> K[Admin reviews<br/>within 1-2 days]
    K --> L{Decision}
    L -->|Approve| M[Email notification<br/>toggle unlocked]
    L -->|Reject| N[Email with reason<br/>user can resubmit]
    M --> F
    N --> G
```

### Key points

- **KYC is optional** — it is only needed if you want automatic eWallet payouts
- **One-time process** — once approved, verification does not need to be repeated
- **Documents deleted quickly** — your ID and selfie are deleted within 48 hours of review
- **You can opt out** — disable automatic payouts at any time to revert to manual processing
