"use client";

import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/16/solid";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  CopyButton,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Bell, X } from "lucide-react";
import { motion } from "motion/react";
import { memo, useRef, useState } from "react";
import { toast } from "sonner";
import AiAssistField from "@/components/ai-assist/AiAssistField";
import {
  MODAL_TRANSITION,
  OVERLAY_PROPS,
  SPRING,
} from "@/components/animations";
import ConfirmModal from "@/components/ConfirmModal";
import { formatIssuingCountryForBank } from "@/lib/country-alpha3";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import {
  duitNowIdTypeLabel,
  formatDuitNowIdForBank,
  formatDuitNowIdForDisplay,
} from "@/lib/duitnow-id";
import {
  getBankDisplayName,
  getPaymentMethodLabel,
  isBillplzSupported,
} from "@/lib/payment-validation";
import {
  canConfirmManualPayment,
  classifyPayoutRoute,
} from "@/lib/payout-routing";
import { statusCopy, TRANSACTION_STATUS } from "@/lib/status-copy";
import {
  markTransactionAsPaid,
  payViaBillplz,
  payViaRoblox,
  rejectTransaction,
  resendPaymentConfirmation,
} from "./actions";
import {
  confirmDuitNowIdResolved,
  markDuitNowIdUnreachable,
} from "./duitnow-actions";
import { sendPaymentInfoNotice } from "./email-actions";
import ProofReviewPanel from "./ProofReviewPanel";
import type { PayoutPaymentDetails, PayoutTransaction } from "./types";

function renderPaymentDetails(
  paymentMethod: string,
  details: PayoutPaymentDetails | null,
) {
  // Settled payouts ship no payment rails. Without this branch every "Missing"
  // fallback below would fire at once and read as data corruption.
  if (!details) {
    return (
      <Text size="sm" c="dimmed" fs="italic">
        Payment details hidden for settled payouts
      </Text>
    );
  }
  const tx = details;
  if (paymentMethod === "PAYPAL") {
    return (
      tx.paypalEmail || (
        <span style={{ color: "var(--mantine-color-red-6)" }}>
          Missing Email
        </span>
      )
    );
  }
  if (paymentMethod === "ROBUX") {
    return (
      tx.robuxUsername || (
        <span style={{ color: "var(--mantine-color-red-6)" }}>
          Missing Username
        </span>
      )
    );
  }
  if (paymentMethod === "BANK_TRANSFER") {
    return (
      <>
        <div>
          Bank:{" "}
          {getBankDisplayName(tx.bankName) || (
            <span style={{ color: "var(--mantine-color-red-6)" }}>Missing</span>
          )}
        </div>
        <div>
          Acct:{" "}
          {tx.bankAccountNumber || (
            <span style={{ color: "var(--mantine-color-red-6)" }}>Missing</span>
          )}
        </div>
        <div>
          Name:{" "}
          {tx.bankAccountName || (
            <span style={{ color: "var(--mantine-color-red-6)" }}>Missing</span>
          )}
        </div>
      </>
    );
  }
  if (paymentMethod === "DUITNOW") {
    // Precedence matches classifyPayoutRoute, which checks the bank triple
    // BEFORE the proxy. This branch used to check the proxy first, so a
    // developer with both was shown "ID: 0123456789" while Billplz was
    // actually paid their bank account. Whichever we pay is what we show.
    const hasBankTriple = Boolean(
      tx.bankName && tx.bankAccountNumber && tx.bankAccountName,
    );

    if (hasBankTriple) {
      return (
        <>
          <div>Bank: {getBankDisplayName(tx.bankName)}</div>
          <div>Acct: {tx.bankAccountNumber}</div>
          <div>Name: {tx.bankAccountName}</div>
          {tx.duitNowId && (
            <div style={{ color: "var(--mantine-color-dimmed)" }}>
              (DuitNow ID {tx.duitNowId} on file — not used, the bank account
              takes precedence)
            </div>
          )}
        </>
      );
    }

    if (tx.duitNowId) {
      return (
        <>
          <div>
            Transfer via:{" "}
            {tx.duitNowIdType ? (
              duitNowIdTypeLabel(tx.duitNowIdType)
            ) : (
              <span style={{ color: "var(--mantine-color-red-6)" }}>
                Type not recorded — ask the developer to re-save it
              </span>
            )}
          </div>
          {/* Above the number because the bank asks for it first, in the
              words the bank's own select uses. */}
          {tx.duitNowIdType === "PASSPORT" && (
            <div>
              Issuing country:{" "}
              {tx.duitNowIdCountry ? (
                formatIssuingCountryForBank(tx.duitNowIdCountry)
              ) : (
                <span style={{ color: "var(--mantine-color-red-6)" }}>
                  Not recorded — ask the developer to re-save it
                </span>
              )}
            </div>
          )}
          <div>
            ID:{" "}
            {tx.duitNowIdType
              ? formatDuitNowIdForDisplay(tx.duitNowIdType, tx.duitNowId)
              : tx.duitNowId}
          </div>
          {/* The developer's claim, for comparing with the recipient bank the
              lookup shows. Never an input to the transfer itself. */}
          <div style={{ color: "var(--mantine-color-dimmed)" }}>
            Linked at:{" "}
            {tx.duitNowIdInstitution
              ? `${getBankDisplayName(tx.duitNowIdInstitution)} (developer's claim)`
              : "not recorded"}
          </div>
        </>
      );
    }

    return (
      <>
        <div>
          Bank:{" "}
          {getBankDisplayName(tx.bankName) || (
            <span style={{ color: "var(--mantine-color-red-6)" }}>Missing</span>
          )}
        </div>
        <div>
          Acct:{" "}
          {tx.bankAccountNumber || (
            <span style={{ color: "var(--mantine-color-red-6)" }}>Missing</span>
          )}
        </div>
        <div>
          Name:{" "}
          {tx.bankAccountName || (
            <span style={{ color: "var(--mantine-color-red-6)" }}>Missing</span>
          )}
        </div>
      </>
    );
  }
  return null;
}

function PayoutCard({ transaction: tx }: { transaction: PayoutTransaction }) {
  const [loading, setLoading] = useState(false);
  const [billplzLoading, setBillplzLoading] = useState(false);
  const [robloxLoading, setRobloxLoading] = useState(false);
  const [lookupBusy, setLookupBusy] = useState<
    "resolved" | "NOT_FOUND" | "NAME_MISMATCH" | null
  >(null);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  const [
    reasonModalOpened,
    { open: openReasonModal, close: closeReasonModal },
  ] = useDisclosure(false);
  const [
    rejectModalOpened,
    { open: openRejectModal, close: closeRejectModal },
  ] = useDisclosure(false);
  const [reason, setReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const rejectRef = useRef<HTMLTextAreaElement>(null);
  const [sendingNotice, setSendingNotice] = useState(false);
  const [resending, setResending] = useState(false);

  const isPending = tx.status === "PENDING";
  const isPaid = tx.status === "PAID";
  const isRejected = tx.status === "REJECTED";
  const isBonus = tx.source === "BONUS";
  const isIncentive = tx.source === "INCENTIVE";
  const hasProof =
    !!tx.proofBody ||
    !!tx.proofCommentUrl ||
    (tx.proofAttachments?.length ?? 0) > 0;
  const { color, label } = statusCopy(TRANSACTION_STATUS, tx.status);

  // Billplz eligibility: MYR + DuitNow with Billplz-supported bank + bank details present + no active payout
  const billplzEligible =
    isPending &&
    tx.currency === "MYR" &&
    tx.paymentMethod === "DUITNOW" &&
    isBillplzSupported(tx.paymentDetails?.bankName) &&
    !!tx.paymentDetails?.bankAccountNumber &&
    !!tx.paymentDetails?.bankAccountName &&
    (!tx.payout || tx.payout.status === "FAILED");

  // Roblox eligibility: ROBUX currency + robloxId present + no active payout
  const robloxEligible =
    isPending &&
    tx.currency === "ROBUX" &&
    tx.paymentMethod === "ROBUX" &&
    !!tx.paymentDetails?.robloxId &&
    (!tx.payout || tx.payout.status === "FAILED");

  // A proxy payout: a DuitNow ID with no bank triple. This is the only shape
  // that goes through a manual bank lookup, so it is the only one worth asking
  // an admin to record an answer for.
  const isDuitNowProxy =
    tx.paymentMethod === "DUITNOW" &&
    !!tx.paymentDetails?.duitNowId &&
    !tx.paymentDetails?.bankAccountNumber;

  // What the last bank lookup said, if anything. Advisory: it never gates the
  // payout buttons — the backfill leaves every pre-existing proxy UNCONFIRMED,
  // so gating on it would freeze every in-flight proxy payout on deploy day.
  const duitNowStatus = tx.paymentDetails?.duitNowIdStatus ?? "UNCONFIRMED";
  const duitNowCheckedAt = tx.paymentDetails?.duitNowIdCheckedAt;
  const duitNowInstitutionName = getBankDisplayName(
    tx.paymentDetails?.duitNowIdInstitution,
  );
  const duitNowStatusColor =
    duitNowStatus === "UNREACHABLE"
      ? "red"
      : duitNowStatus === "RESOLVED"
        ? "teal"
        : "dimmed";
  const duitNowStatusLabel =
    duitNowStatus === "UNREACHABLE"
      ? `Bank could not reach this ID${duitNowCheckedAt ? ` — checked ${new Date(duitNowCheckedAt).toLocaleDateString("en-MY")}` : ""}`
      : duitNowStatus === "RESOLVED"
        ? `Bank found this ID${duitNowCheckedAt ? ` — checked ${new Date(duitNowCheckedAt).toLocaleDateString("en-MY")}` : ""}`
        : duitNowStatus === "CONFIRMED"
          ? `Developer says it is linked${duitNowInstitutionName ? ` at ${duitNowInstitutionName}` : ""}; no bank lookup recorded yet`
          : "Nobody has confirmed this ID is linked";

  async function recordLookup(
    outcome: "resolved" | "NOT_FOUND" | "NAME_MISMATCH",
  ) {
    setLookupBusy(outcome);
    const res =
      outcome === "resolved"
        ? await confirmDuitNowIdResolved(tx.userId)
        : await markDuitNowIdUnreachable(tx.userId, outcome);
    setLookupBusy(null);
    if (res?.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      outcome === "resolved"
        ? "Recorded — the bank can reach this ID."
        : "Recorded, and the developer has been told what to fix.",
    );
  }

  const payoutProcessing = tx.payout?.status === "PROCESSING";
  const payoutFailed = tx.payout?.status === "FAILED";
  const payoutRoute = classifyPayoutRoute({
    transactionStatus: tx.status,
    currency: tx.currency,
    paymentMethod: tx.paymentMethod,
    // classifyPayoutRoute short-circuits on a non-PENDING status before it
    // reads any of these, so settled rows are unaffected by the nulls.
    paypalEmail: tx.paymentDetails?.paypalEmail,
    duitNowId: tx.paymentDetails?.duitNowId,
    bankName: tx.paymentDetails?.bankName,
    bankAccountNumber: tx.paymentDetails?.bankAccountNumber,
    bankAccountName: tx.paymentDetails?.bankAccountName,
    robloxId: tx.paymentDetails?.robloxId,
    payout: tx.payout,
  });
  const manualPaymentEligible = canConfirmManualPayment(payoutRoute);

  async function handleMarkPaid() {
    setLoading(true);
    setError("");
    const res = await markTransactionAsPaid(tx.id);
    if (res?.error) {
      setError(res.error);
    } else if (res?.confirmation === "failed") {
      // The payment went through; only the email did not. Say both, because
      // the developer has been paid and does not know it.
      toast.warning(
        `Marked as paid, but the confirmation email failed${
          res.confirmationDetail ? ` (${res.confirmationDetail})` : ""
        }. Use "Resend confirmation" on this payout.`,
        { duration: 10_000 },
      );
    } else {
      toast.success("Marked as paid");
    }
    setLoading(false);
  }

  async function handleResendConfirmation() {
    setResending(true);
    setError("");
    const res = await resendPaymentConfirmation(tx.id);
    if (res?.error) {
      setError(res.error);
    } else {
      toast.success("Confirmation email sent");
    }
    setResending(false);
  }

  async function handlePayViaBillplz() {
    setBillplzLoading(true);
    setError("");
    const res = await payViaBillplz(tx.id);
    if (res?.error) {
      setError(res.error);
    } else {
      toast.success("Billplz payout initiated");
    }
    setBillplzLoading(false);
  }

  async function handlePayViaRoblox() {
    setRobloxLoading(true);
    setError("");
    const res = await payViaRoblox(tx.id);
    if (res?.error) {
      setError(res.error);
    } else {
      toast.success("Roblox payout completed");
    }
    setRobloxLoading(false);
  }

  async function handleReject() {
    setRejecting(true);
    const res = await rejectTransaction(
      tx.id,
      rejectReason.trim() || undefined,
    );
    if (res?.error) {
      toast.error(res.error);
    } else if (res?.followUpDetail) {
      // The rejection committed; some of the cleanup after it did not. Say
      // both, because "rejected" alone would hide a campaign uplift that is
      // still charged or a developer who was never told.
      toast.warning(
        `Payout rejected, but follow-up work failed (${res.followUpDetail}). ` +
          "The hourly reconcile job will retry it.",
        { duration: 10_000 },
      );
    } else {
      toast.success("Payout rejected");
    }
    setRejecting(false);
    setRejectReason("");
    closeRejectModal();
  }

  async function handleSendPaymentNotice() {
    setSendingNotice(true);
    const res = await sendPaymentInfoNotice(
      tx.userId,
      reason.trim() || undefined,
    );
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Payment issue notification sent");
    }
    setSendingNotice(false);
    setReason("");
    closeReasonModal();
  }

  return (
    <>
      <motion.div
        whileHover={{ y: -3 }}
        transition={SPRING.snappy}
        style={{ height: "100%" }}
      >
        <Card
          withBorder
          radius="md"
          padding="lg"
          h="100%"
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <Stack flex={1} gap="xs">
            <Group justify="space-between" align="flex-start">
              <Group gap="xs">
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={1}>
                  {tx.developerName}
                </Text>
                {!isPending && (
                  <Badge size="xs" color={color} variant="light">
                    {label}
                  </Badge>
                )}
                {isBonus && (
                  <Badge size="xs" color="green" variant="light">
                    Bonus
                  </Badge>
                )}
                {isIncentive && (
                  <Badge size="xs" color="blue" variant="light">
                    Incentive
                  </Badge>
                )}
                {tx.autoApproved && isPending && (
                  <Badge size="xs" color="teal" variant="light">
                    Auto-approved
                  </Badge>
                )}
              </Group>
              <Text size="lg" fw={700} c={isPending ? "green" : "dimmed"}>
                {formatAmount(tx.amount, tx.currency as CurrencyCode)}
              </Text>
            </Group>

            <Text fw={600} mb="xs">
              {tx.taskTitle}
            </Text>

            {isBonus && tx.bonusLineItems && tx.bonusLineItems.length > 0 && (
              <Box
                bg="var(--mantine-color-dark-6)"
                p="sm"
                style={{ borderRadius: "var(--mantine-radius-md)" }}
              >
                <Text size="sm" fw={600} mb="xs">
                  Bonus Line Items
                </Text>
                <Stack gap={6}>
                  {tx.bonusLineItems.map((item) => (
                    <Group key={item.id} justify="space-between" wrap="nowrap">
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {item.identifier ? `${item.identifier} - ` : ""}
                        {item.title || "Untitled task"}
                      </Text>
                      {item.amount != null && (
                        <Text size="xs" fw={600}>
                          {formatAmount(
                            item.amount,
                            tx.currency as CurrencyCode,
                          )}
                        </Text>
                      )}
                    </Group>
                  ))}
                </Stack>
              </Box>
            )}

            {isIncentive &&
              tx.incentiveLineItems &&
              tx.incentiveLineItems.length > 0 && (
                <Box
                  bg="var(--mantine-color-dark-6)"
                  p="sm"
                  style={{ borderRadius: "var(--mantine-radius-md)" }}
                >
                  <Text size="sm" fw={600} mb="xs">
                    Incentive Line Items
                  </Text>
                  <Stack gap={6}>
                    {tx.incentiveLineItems.map((item) => (
                      <Group
                        key={item.id}
                        justify="space-between"
                        wrap="nowrap"
                      >
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {item.type.replaceAll("_", " ")} - {item.period}
                        </Text>
                        <Text size="xs" fw={600}>
                          {formatAmount(
                            item.netAmount ?? item.amount,
                            tx.currency as CurrencyCode,
                          )}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                </Box>
              )}

            {isPaid && tx.paidAt && (
              <Text size="xs" c="dimmed">
                Paid on {new Date(tx.paidAt).toLocaleDateString()}
              </Text>
            )}

            {isRejected && (
              <>
                {tx.rejectedAt && (
                  <Text size="xs" c="dimmed">
                    Rejected on {new Date(tx.rejectedAt).toLocaleDateString()}
                  </Text>
                )}
                {tx.rejectionReason && (
                  <Box
                    bg="var(--mantine-color-red-light)"
                    p="sm"
                    style={{ borderRadius: "var(--mantine-radius-md)" }}
                  >
                    <Text size="xs" fw={600} c="red" mb={2}>
                      Reason
                    </Text>
                    <Text size="sm">{tx.rejectionReason}</Text>
                  </Box>
                )}
              </>
            )}

            {tx.source === "PPT" && tx.proofStatus && (
              <Box
                bg="var(--mantine-color-dark-6)"
                p="sm"
                style={{ borderRadius: "var(--mantine-radius-md)" }}
              >
                <Group justify="space-between" gap="xs">
                  <Text size="sm" fw={600}>
                    PPT Eligibility
                  </Text>
                  <Badge
                    size="xs"
                    color={tx.status === "ON_HOLD" ? "orange" : "blue"}
                    variant="light"
                  >
                    {tx.proofStatus.replaceAll("_", " ")}
                  </Badge>
                </Group>
                {tx.proofReason && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {tx.proofReason.replaceAll("_", " ")}
                  </Text>
                )}
                {/* The wrapper carries the margin, so it has to share the
                    panel's own "is there anything to show" test — otherwise a
                    proofless row pads the box with empty space. */}
                {hasProof && (
                  <Box mt="xs">
                    <ProofReviewPanel
                      body={tx.proofBody ?? null}
                      attachments={tx.proofAttachments ?? []}
                      commentUrl={tx.proofCommentUrl ?? null}
                      linearIssueId={tx.linearIssueId ?? null}
                      variant="compact"
                    />
                  </Box>
                )}
              </Box>
            )}

            <Box
              bg="var(--mantine-color-default-hover)"
              p="sm"
              style={{ borderRadius: "var(--mantine-radius-md)" }}
            >
              <Text size="sm" fw={600} mb={4}>
                Pay via {getPaymentMethodLabel(tx.paymentMethod)}
              </Text>
              {/* component="div": renderPaymentDetails returns block elements,
                  which are invalid inside the default <p>. */}
              <Text size="sm" c="dimmed" ff="monospace" component="div">
                {renderPaymentDetails(tx.paymentMethod, tx.paymentDetails)}
              </Text>
              {isDuitNowProxy && tx.paymentDetails && (
                <Text size="xs" c={duitNowStatusColor} mt={4}>
                  {duitNowStatusLabel}
                </Text>
              )}
            </Box>

            {tx.payout && (
              <Badge
                size="sm"
                variant="light"
                color={
                  tx.payout.status === "COMPLETED"
                    ? "green"
                    : tx.payout.status === "PROCESSING"
                      ? "blue"
                      : tx.payout.status === "FAILED"
                        ? "red"
                        : "yellow"
                }
              >
                {tx.payout.provider}: {tx.payout.status.toLowerCase()}
              </Badge>
            )}

            {payoutFailed && tx.payout?.errorMessage && (
              <Text size="xs" c="red">
                {tx.payout.errorMessage}
              </Text>
            )}

            {isPending &&
              !isBonus &&
              !isIncentive &&
              tx.creditLimitUsage &&
              tx.creditLimitUsage.limit > 0 && (
                <Text size="xs" c="dimmed">
                  Credit limit: RM{tx.creditLimitUsage.used.toFixed(0)}/RM
                  {tx.creditLimitUsage.limit} this week
                </Text>
              )}

            {isPending && tx.currency === "MYR" && (
              <Box
                bg="var(--mantine-color-dark-6)"
                p="sm"
                style={{ borderRadius: "var(--mantine-radius-md)" }}
              >
                <Text size="sm" fw={600} mb="xs">
                  {isBonus
                    ? "Bonus Transfer Fields"
                    : isIncentive
                      ? "Incentive Transfer Fields"
                      : "Bank Transfer Fields"}
                </Text>
                <Stack gap={6}>
                  {/* The proxy itself, in the form the bank field takes —
                      PayNet specifies MBNO as "+60…" and bank inputs reject
                      the separators humans read by. Until now none of the
                      payment values had a copy button at all: the admin
                      hand-selected them out of a monospace <Text>. */}
                  {tx.paymentMethod === "DUITNOW" &&
                    tx.paymentDetails?.duitNowIdType === "PASSPORT" &&
                    tx.paymentDetails.duitNowIdCountry &&
                    !tx.paymentDetails.bankAccountNumber && (
                      <CopyField
                        label="Issuing country"
                        value={formatIssuingCountryForBank(
                          tx.paymentDetails.duitNowIdCountry,
                        )}
                      />
                    )}
                  {tx.paymentMethod === "DUITNOW" &&
                    tx.paymentDetails?.duitNowId &&
                    tx.paymentDetails.duitNowIdType &&
                    !tx.paymentDetails.bankAccountNumber && (
                      <CopyField
                        label={`DuitNow ${duitNowIdTypeLabel(tx.paymentDetails.duitNowIdType)}`}
                        value={formatDuitNowIdForBank(
                          tx.paymentDetails.duitNowIdType,
                          tx.paymentDetails.duitNowId,
                        )}
                      />
                    )}
                  <CopyField
                    label="Recipient's Reference"
                    value={
                      isBonus
                        ? `Bonus / ${tx.bonusPeriod || tx.id}`
                        : isIncentive
                          ? `Incentive / ${tx.id.slice(-8)}`
                          : `PPT task / ${tx.linearIssueIdentifier || "N/A"}`
                    }
                  />
                  <CopyField
                    label="Other Payment Details"
                    value={
                      isBonus || isIncentive
                        ? tx.taskTitle
                        : tx.linearIssueUrl || ""
                    }
                  />
                  <CopyField
                    label="Email Address"
                    value={tx.paymentDetails?.email || ""}
                  />
                  <CopyField
                    label="Message to Beneficiary"
                    value={`Payment of ${formatAmount(tx.amount, tx.currency as CurrencyCode)} for ${isBonus ? "monthly bonus" : isIncentive ? "DevHub incentives" : tx.linearIssueIdentifier || "PPT task"}: ${tx.taskTitle}. Thank you for your contribution to MYSverse!`}
                  />
                </Stack>
              </Box>
            )}
          </Stack>

          <Box mt="auto">
            {error && (
              <Text size="xs" c="red" mb="xs">
                {error}
              </Text>
            )}
            {isPending && (
              <>
                {robloxEligible && (
                  <Button
                    fullWidth
                    onClick={handlePayViaRoblox}
                    loading={robloxLoading}
                    variant="filled"
                    color="green"
                  >
                    {payoutFailed ? "Retry via Roblox" : "Pay via Roblox"}
                  </Button>
                )}
                {billplzEligible && (
                  <Button
                    fullWidth
                    onClick={handlePayViaBillplz}
                    loading={billplzLoading}
                    variant="filled"
                    color="green"
                    mt={robloxEligible ? "xs" : undefined}
                  >
                    {payoutFailed ? "Retry via Billplz" : "Pay via Billplz"}
                  </Button>
                )}
                {payoutProcessing ? (
                  <Button
                    fullWidth
                    variant="light"
                    color="blue"
                    disabled
                    mt="xs"
                  >
                    {tx.payout?.provider} Processing...
                  </Button>
                ) : manualPaymentEligible ? (
                  <Button
                    fullWidth
                    onClick={handleMarkPaid}
                    loading={loading}
                    variant="light"
                    color="blue"
                    mt="xs"
                  >
                    Confirm Manual Payment
                  </Button>
                ) : (
                  <Tooltip label={payoutRoute.reason} withArrow>
                    <Button
                      fullWidth
                      variant="light"
                      color="gray"
                      disabled
                      mt="xs"
                    >
                      Manual confirmation unavailable
                    </Button>
                  </Tooltip>
                )}
                <Button
                  fullWidth
                  onClick={openRejectModal}
                  variant="light"
                  color="red"
                  mt="xs"
                >
                  Reject
                </Button>
                <Button
                  fullWidth
                  onClick={openReasonModal}
                  variant="light"
                  color="yellow"
                  mt="xs"
                >
                  Notify: Payment Issue
                </Button>
                {/* The bank lookup an admin performs anyway is the only
                    ground truth about whether a proxy is registered — no
                    public proxy-resolution API exists for a non-bank. These
                    record its answer instead of discarding it. */}
                {isDuitNowProxy && (
                  <Stack gap={4} mt="sm">
                    <Text size="xs" c="dimmed">
                      Did the bank find this DuitNow ID?
                    </Text>
                    <Group grow gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        color="teal"
                        loading={lookupBusy === "resolved"}
                        onClick={() => recordLookup("resolved")}
                      >
                        Found it
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="orange"
                        loading={lookupBusy === "NAME_MISMATCH"}
                        onClick={() => recordLookup("NAME_MISMATCH")}
                      >
                        Wrong name
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        loading={lookupBusy === "NOT_FOUND"}
                        onClick={() => recordLookup("NOT_FOUND")}
                      >
                        Not found
                      </Button>
                    </Group>
                  </Stack>
                )}
              </>
            )}
            {isPaid && (
              // The recovery path for a confirmation that never went out —
              // the payment is settled, so "Mark as Paid" can no longer be
              // pressed to trigger it. Dedupe upstream makes a redundant
              // press harmless.
              <Button
                fullWidth
                onClick={handleResendConfirmation}
                loading={resending}
                variant="light"
                color="gray"
                mt="xs"
              >
                Resend confirmation
              </Button>
            )}
            {(isPending || isPaid) && (
              <Button
                component="a"
                href={`/api/transactions/${tx.id}/pdf`}
                fullWidth
                variant="light"
                color="gray"
                mt="xs"
              >
                Download Slip
              </Button>
            )}
          </Box>
        </Card>
      </motion.div>

      {/* Payment Issue Notification Modal */}
      <Modal
        opened={reasonModalOpened}
        onClose={sendingNotice ? () => {} : closeReasonModal}
        title="Notify Payment Issue"
        centered
        radius="md"
        transitionProps={MODAL_TRANSITION}
        overlayProps={{ ...OVERLAY_PROPS }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Send an email to <strong>{tx.developerName}</strong> notifying them
            that their payment information needs to be updated.
          </Text>
          <Textarea
            label="Reason (optional)"
            placeholder="e.g. Bank account name does not match name on system"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            autosize
            minRows={2}
            maxRows={4}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={closeReasonModal}
              disabled={sendingNotice}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendPaymentNotice}
              loading={sendingNotice}
              color="yellow"
              leftSection={<Bell size={14} />}
            >
              Send Notification
            </Button>
          </Group>
        </Stack>
      </Modal>

      <ConfirmModal
        opened={rejectModalOpened}
        onClose={closeRejectModal}
        onConfirm={handleReject}
        title="Reject payout?"
        description={
          <>
            This will reject the payout for <strong>{tx.developerName}</strong>{" "}
            and notify them via email.
          </>
        }
        extra={
          <>
            <Textarea
              ref={rejectRef}
              label="Reason (optional)"
              placeholder="e.g. Duplicate task, issue not completed correctly"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.currentTarget.value)}
              autosize
              minRows={2}
              maxRows={4}
            />
            <AiAssistField
              fieldId="payout_reject_reason"
              value={rejectReason}
              onChange={setRejectReason}
              textareaRef={rejectRef}
              disabled={rejecting}
            />
          </>
        }
        confirmLabel="Reject payout"
        confirmIcon={<X size={14} />}
        loading={rejecting}
      />
    </>
  );
}

export default memo(PayoutCard);

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Group gap={4} wrap="nowrap">
        <Text size="xs" ff="monospace" style={{ wordBreak: "break-all" }}>
          {value || "—"}
        </Text>
        {value && (
          <CopyButton value={value}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color={copied ? "teal" : "gray"}
                  onClick={copy}
                >
                  {copied ? (
                    <CheckIcon className="size-3" />
                  ) : (
                    <ClipboardDocumentIcon className="size-3" />
                  )}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        )}
      </Group>
    </Box>
  );
}
