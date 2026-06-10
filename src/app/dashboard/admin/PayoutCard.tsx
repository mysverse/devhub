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
import { memo, useState } from "react";
import { toast } from "sonner";
import {
  MODAL_TRANSITION,
  OVERLAY_PROPS,
  SPRING,
} from "@/components/animations";
import ConfirmModal from "@/components/ConfirmModal";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import {
  getBankDisplayName,
  getPaymentMethodLabel,
  isBillplzSupported,
  isXenditSupported,
  requiresKycForAutoPayout,
} from "@/lib/payment-validation";
import {
  markTransactionAsPaid,
  payViaBillplz,
  payViaRoblox,
  payViaXendit,
  rejectTransaction,
} from "./actions";
import { sendPaymentInfoNotice } from "./email-actions";
import type { PayoutTransaction } from "./types";

function renderPaymentDetails(tx: PayoutTransaction) {
  if (tx.paymentMethod === "PAYPAL") {
    return (
      tx.paypalEmail || (
        <span style={{ color: "var(--mantine-color-red-6)" }}>
          Missing Email
        </span>
      )
    );
  }
  if (tx.paymentMethod === "ROBUX") {
    return (
      tx.robuxUsername || (
        <span style={{ color: "var(--mantine-color-red-6)" }}>
          Missing Username
        </span>
      )
    );
  }
  if (tx.paymentMethod === "BANK_TRANSFER") {
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
  if (tx.paymentMethod === "DUITNOW") {
    if (tx.duitNowId) {
      return <>ID: {tx.duitNowId}</>;
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

const statusConfig: Record<string, { color: string; label: string }> = {
  PENDING: { color: "yellow", label: "Pending" },
  PAID: { color: "green", label: "Paid" },
  REJECTED: { color: "red", label: "Rejected" },
  CANCELLED: { color: "gray", label: "Cancelled" },
  ON_HOLD: { color: "orange", label: "On hold" },
};

function PayoutCard({ transaction: tx }: { transaction: PayoutTransaction }) {
  const [loading, setLoading] = useState(false);
  const [billplzLoading, setBillplzLoading] = useState(false);
  const [xenditLoading, setXenditLoading] = useState(false);
  const [robloxLoading, setRobloxLoading] = useState(false);
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
  const [sendingNotice, setSendingNotice] = useState(false);

  const isPending = tx.status === "PENDING";
  const isPaid = tx.status === "PAID";
  const isRejected = tx.status === "REJECTED";
  const isBonus = tx.source === "BONUS";
  const isIncentive = tx.source === "INCENTIVE";
  const { color, label } = statusConfig[tx.status] ?? {
    color: "gray",
    label: tx.status,
  };

  // Billplz eligibility: MYR + DuitNow with Billplz-supported bank + bank details present + no active payout
  const billplzEligible =
    isPending &&
    tx.currency === "MYR" &&
    tx.paymentMethod === "DUITNOW" &&
    isBillplzSupported(tx.bankName) &&
    !!tx.bankAccountNumber &&
    !!tx.bankAccountName &&
    (!tx.payout || tx.payout.status === "FAILED");

  // Xendit eligibility: eWallet only + enabled + MYR + Xendit-supported + bank details + no active payout
  const xenditEligible =
    !!tx.xenditEnabled &&
    isPending &&
    tx.currency === "MYR" &&
    tx.paymentMethod === "DUITNOW" &&
    requiresKycForAutoPayout(tx.bankName) &&
    isXenditSupported(tx.bankName) &&
    !!tx.bankAccountNumber &&
    !!tx.bankAccountName &&
    (!tx.payout || tx.payout.status === "FAILED");

  // Roblox eligibility: ROBUX currency + robloxId present + no active payout
  const robloxEligible =
    isPending &&
    tx.currency === "ROBUX" &&
    tx.paymentMethod === "ROBUX" &&
    !!tx.robloxId &&
    (!tx.payout || tx.payout.status === "FAILED");

  const payoutProcessing = tx.payout?.status === "PROCESSING";
  const payoutFailed = tx.payout?.status === "FAILED";

  async function handleMarkPaid() {
    setLoading(true);
    setError("");
    const res = await markTransactionAsPaid(tx.id);
    if (res?.error) {
      setError(res.error);
    }
    setLoading(false);
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

  async function handlePayViaXendit() {
    setXenditLoading(true);
    setError("");
    const res = await payViaXendit(tx.id);
    if (res?.error) {
      setError(res.error);
    } else {
      toast.success("Xendit payout initiated");
    }
    setXenditLoading(false);
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
                {tx.proofCommentUrl && (
                  <Button
                    component="a"
                    href={tx.proofCommentUrl}
                    target="_blank"
                    size="xs"
                    variant="subtle"
                    color="gray"
                    mt="xs"
                    px={0}
                  >
                    Open proof comment
                  </Button>
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
              <Text size="sm" c="dimmed" ff="monospace">
                {renderPaymentDetails(tx)}
              </Text>
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
                  <CopyField label="Email Address" value={tx.email || ""} />
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
                {xenditEligible && !billplzEligible && (
                  <Button
                    fullWidth
                    onClick={handlePayViaXendit}
                    loading={xenditLoading}
                    variant="filled"
                    color="green"
                    mt={robloxEligible ? "xs" : undefined}
                  >
                    {payoutFailed ? "Retry via Xendit" : "Pay via Xendit"}
                  </Button>
                )}
                {xenditEligible && billplzEligible && (
                  <Button
                    fullWidth
                    onClick={handlePayViaXendit}
                    loading={xenditLoading}
                    variant="light"
                    color="green"
                    mt="xs"
                  >
                    {payoutFailed ? "Retry via Xendit" : "Pay via Xendit"}
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
                ) : (
                  <Button
                    fullWidth
                    onClick={handleMarkPaid}
                    loading={loading}
                    variant="light"
                    color="blue"
                    mt="xs"
                  >
                    Mark as Paid
                  </Button>
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
              </>
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
          <Textarea
            label="Reason (optional)"
            placeholder="e.g. Duplicate task, issue not completed correctly"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.currentTarget.value)}
            autosize
            minRows={2}
            maxRows={4}
          />
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
