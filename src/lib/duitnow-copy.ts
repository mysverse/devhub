/**
 * What a failed DuitNow lookup means, in the developer's words.
 *
 * Shared by the admin action that sends the notification and the banner the
 * developer sees on their settings page, so the email and the screen cannot
 * describe the same problem differently.
 */

export type DuitNowIssueKey =
  | "NOT_FOUND"
  | "NAME_MISMATCH"
  | "WRONG_TYPE"
  | "REGISTERED_ELSEWHERE";

export const DUITNOW_ISSUE_COPY: Record<DuitNowIssueKey, string> = {
  NOT_FOUND:
    "We searched for your DuitNow ID at our bank and nothing came up. That usually means it was never registered as a DuitNow ID — having the number in your banking or e-wallet app is not the same thing.",
  NAME_MISMATCH:
    "Your DuitNow ID resolves to an account in a different name from the one on your DevHub profile. We can only pay an account in your own name.",
  WRONG_TYPE:
    "Your DuitNow ID does not match the kind of ID it is saved as, so our bank cannot look it up.",
  REGISTERED_ELSEWHERE:
    "Your DuitNow ID is registered somewhere our bank cannot reach. Registering it against a Malaysian bank account, or giving us a bank account number instead, will fix it.",
};

export function duitNowIssueMessage(issue: string | null | undefined): string {
  return (
    DUITNOW_ISSUE_COPY[issue as DuitNowIssueKey] ?? DUITNOW_ISSUE_COPY.NOT_FOUND
  );
}
