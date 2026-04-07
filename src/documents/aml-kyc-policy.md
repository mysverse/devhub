---
title: "AML/KYC Policy"
version: "1.0.0"
type: "AML_KYC"
---

# Anti-Money Laundering & Know Your Customer Policy

*Last updated: April 2026*

## 1. Introduction

This policy explains how MYSverse Digital Ventures ("we", "us") handles identity verification for contributors who opt into automated eWallet payouts through our DevHub platform. Identity verification (Know Your Customer, or KYC) is required by our payment partner to comply with anti-money laundering (AML) regulations.

**This policy applies only to contributors who choose to enable automatic payouts via eWallet providers** (e.g., TnG E-Wallet, GrabPay). KYC is not required for:

- General platform usage
- Manual payout requests processed by administrators
- Bank transfer payouts (via Billplz or Xendit bank disbursement)
- Robux payouts

## 2. What We Collect

When you choose to verify your identity, we collect the following:

- **A photo of your government-issued ID** — MyKad, Malaysian passport, Malaysian driving licence, or international passport for non-Malaysian contributors.
- **A selfie of you holding the ID** — This confirms you are the owner of the document.
- **Your legal name** — As it appears on your ID document.

We do not collect or store ID numbers, dates of birth, or any other data from your document beyond what is listed above.

## 3. Why We Collect It

Our payment partner requires identity verification for all users accessing automated eWallet payouts. This is a regulatory requirement under Malaysian anti-money laundering laws and the payment provider's compliance obligations.

Verification is a one-time process. Once approved, you will not need to verify again unless your account circumstances change significantly.

## 4. Who Has Access

Your submitted documents are reviewed by **one authorised team member** during the verification process. Access to verification documents is restricted to administrators with a legitimate review purpose.

All access is logged in an audit trail that records: who reviewed the submission, what action was taken, and when — but never the document contents.

## 5. How Your Data Is Protected

- **In transit:** All uploads are transmitted over HTTPS (TLS encryption).
- **At rest:** Documents are stored in an isolated, private storage system with no public access.
- **EXIF metadata:** All image metadata (location data, device info, etc.) is automatically stripped from your photos before storage.
- **Access control:** Document storage is accessible only by the review system — not by the general application.

## 6. Retention Period

| Data | Retention |
|---|---|
| Uploaded ID photo | Deleted within 48 hours of review decision |
| Selfie photo | Deleted within 48 hours of review decision |
| Unreviewed submissions | Auto-expire and are deleted after 7 days |
| Verification result (approved/rejected) | Retained for compliance purposes |
| Your legal name | Retained while your account is active |
| Reviewer audit log | Retained for compliance purposes |
| Document contents or ID numbers | Never stored beyond the review session |

An automated cleanup process runs regularly to enforce these retention limits. Deletion is permanent — there is no soft-delete or recycle bin.

## 7. Your Rights

You have the right to:

- **Opt out at any time.** You can disable automatic payouts in your settings. Your payouts will then be processed manually by an administrator. KYC is never required for manual payouts.
- **Request information.** You can ask us what verification data we hold about you.
- **Request deletion.** You can request deletion of your verification record. Note that this will disable automatic payouts and you would need to re-verify to enable them again.

## 8. Verification Process

1. You select an eWallet payment method and choose to enable automatic payouts.
2. You upload a photo of your government ID and a selfie holding the document.
3. An authorised team member reviews your submission (typically within 1-2 business days).
4. You are notified of the result via email and in your settings.
   - **Approved:** Automatic payouts are unlocked. Documents are deleted within 48 hours.
   - **Rejected:** You are given a reason and may resubmit corrected documents.

## 9. Contact

If you have questions about this policy or your verification data, please contact your team administrator through the platform.

## 10. Changes to This Policy

We may update this policy from time to time. Significant changes will be communicated through the platform. The "Last updated" date at the top of this page reflects the most recent revision.
