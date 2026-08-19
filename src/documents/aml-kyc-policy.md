---
title: "AML/KYC Policy"
version: "2.0.0"
type: "AML_KYC"
---

# Anti-Money Laundering & Know Your Customer Policy

*Last updated: August 2026*

## 1. Identity verification has been discontinued

**MYSverse Digital Ventures ("we", "us") no longer collects identity documents
through DevHub.** The upload form has been removed and there is no way to
submit an ID or a selfie.

Verification previously applied to one group only: contributors who opted into
**automated eWallet payouts**. That option existed to satisfy a prospective
payment partner's own compliance obligations. The partnership did not proceed,
the automated eWallet route was never available in practice, and it has now
been removed from the platform — so the basis for asking anyone to verify
their identity no longer exists.

**No payout method requires verification.** That was already true of manual
payouts, Billplz bank transfers and Robux; it is now true of everything,
including eWallet and DuitNow ID payouts, which are processed by an
administrator through our bank.

Nothing is required of you. If you previously verified, or submitted documents
that were rejected or expired, no further action is needed and your payouts
are unaffected.

## 2. What we collected, while the programme ran

For contributors who took part, we collected:

- **A photo of a government-issued ID** — MyKad, Malaysian passport, Malaysian
  driving licence, or international passport for non-Malaysian contributors.
- **A selfie holding the ID** — to confirm ownership of the document.
- **A legal name** — as it appeared on the document.

We never collected or stored ID numbers, dates of birth, or any other data
from the document beyond the above.

## 3. What happened to those documents

**Every ID photo and selfie has been deleted, or is scheduled for deletion
under the retention rules in section 5.** Deletion is permanent — there is no
soft-delete or recycle bin — and an automated cleanup process continues to run
to enforce it.

What we retain is the **outcome** of a verification (approved, rejected or
expired), the legal name given at the time, and the reviewer audit log. These
are kept as a compliance record of a decision we made, which we committed to
retaining when the documents were collected.

## 4. Who had access

Submissions were reviewed by **one authorised team member**. Access to
documents was restricted to administrators with a legitimate review purpose,
and every access was logged in an audit trail recording who looked, what
action was taken, and when — never the document contents. That audit trail is
retained.

## 5. Retention

| Data | Retention |
|---|---|
| Uploaded ID photo | Deleted within 48 hours of a review decision |
| Selfie photo | Deleted within 48 hours of a review decision |
| Unreviewed submissions | Expired and deleted after 7 days |
| Verification result (approved/rejected) | Retained for compliance purposes |
| Legal name | Retained while your account is active |
| Reviewer audit log | Retained for compliance purposes |
| Document contents or ID numbers | Never stored |

## 6. How the data was protected

- **In transit:** all uploads were transmitted over HTTPS (TLS encryption).
- **At rest:** documents were held in isolated, private storage with no public
  access.
- **EXIF metadata:** image metadata (location, device information) was stripped
  before storage.
- **Access control:** document storage was reachable only by the review
  system, never by the general application.

## 7. Your rights

You have the right to:

- **Request information.** You can ask what verification data we still hold
  about you.
- **Request deletion.** You can request deletion of your verification record.
  Because verification no longer gates anything, this has no effect on your
  payouts.

## 8. Contact

If you have questions about this policy or about verification data we may
still hold, please contact your team administrator through the platform.

## 9. Changes to this policy

We may update this policy from time to time. Significant changes will be
communicated through the platform. The "Last updated" date at the top of this
page reflects the most recent revision.
