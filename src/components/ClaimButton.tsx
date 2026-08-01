"use client";

import { Button, List, ListItem, Text, Textarea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Hand, UserCog } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { claimIssue } from "@/app/dashboard/actions";
import { signIn } from "@/lib/auth-client";
import {
  DEFAULT_UNASSIGN_HOURS,
  DEFAULT_WARN_HOURS,
} from "@/lib/payout-policy";
import ConfirmModal from "./ConfirmModal";

export type ClaimButtonContext = {
  /** Viewer's current claimed-but-unfinished task count. */
  activeCount: number;
  warnHours: number;
  unassignHours: number;
};

type ClaimButtonProps = {
  issueId: string;
  assigneeName?: string | null;
  /** Workload + policy context for the commitment modal. */
  claimContext?: ClaimButtonContext | null;
  /** Preformatted estimated payout, e.g. "RM60.00". */
  estimateLabel?: string | null;
};

const MIN_TAKEOVER_REASON = 10;

export default function ClaimButton({
  issueId,
  assigneeName,
  claimContext,
  estimateLabel,
}: ClaimButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [claimed, setClaimed] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [takeoverReason, setTakeoverReason] = useState("");
  const [reasonTouched, setReasonTouched] = useState(false);

  const warnHours = claimContext?.warnHours ?? DEFAULT_WARN_HOURS;
  const unassignHours = claimContext?.unassignHours ?? DEFAULT_UNASSIGN_HOURS;
  const activeCount = claimContext?.activeCount ?? 0;
  const isTakeover = Boolean(assigneeName);
  const reasonValid = takeoverReason.trim().length >= MIN_TAKEOVER_REASON;

  function handleClaim() {
    if (isTakeover && !reasonValid) {
      setReasonTouched(true);
      return;
    }
    startTransition(async () => {
      const result = await claimIssue(
        issueId,
        isTakeover ? { takeoverReason: takeoverReason.trim() } : undefined,
      );

      if ("reauth" in result && result.reauth) {
        signIn.oauth2({
          providerId: "linear",
          callbackURL: "/dashboard/ppts",
        });
        return;
      }

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setClaimed(true);
      toast.success(
        isTakeover
          ? "Task reassigned to you — the activity timer starts now."
          : `Task claimed — the ${unassignHours}h activity timer starts now.`,
      );
      close();
    });
  }

  const commitmentBullets = (
    <List size="sm" spacing={6} mt="xs">
      <ListItem>
        Post visible progress at least every <strong>{warnHours} hours</strong>{" "}
        — after <strong>{unassignHours} hours</strong> without activity the task
        returns to the board so others can pick it up.
      </ListItem>
      <ListItem>
        Waiting on someone? Mark the task <strong>blocked</strong> from your
        task card — no filler comments needed. Changed your mind? Release it any
        time.
      </ListItem>
      <ListItem>
        Payout needs a <strong>#ppt-proof</strong> comment when you finish
        {estimateLabel ? (
          <>
            {" "}
            — estimated payout: <strong>{estimateLabel}</strong>
          </>
        ) : null}
        .
      </ListItem>
    </List>
  );

  if (isTakeover) {
    return (
      <>
        <Button
          size="xs"
          variant="light"
          color="yellow"
          leftSection={<UserCog size={12} />}
          onClick={open}
        >
          Reassign to me
        </Button>
        <ConfirmModal
          opened={opened}
          onClose={close}
          onConfirm={handleClaim}
          title="Take over this task?"
          description={
            <Text size="sm" component="span">
              This task is currently assigned to <strong>{assigneeName}</strong>
              . Taking it over reassigns it to you, and{" "}
              <strong>{assigneeName} will be notified with your reason</strong>.
              Their completed work stays credited to them.
            </Text>
          }
          extra={
            <Textarea
              label="Why are you taking this over?"
              placeholder="e.g. Needed for the release and there's been no activity for days"
              value={takeoverReason}
              onChange={(event) => setTakeoverReason(event.currentTarget.value)}
              onBlur={() => setReasonTouched(true)}
              error={
                reasonTouched && !reasonValid
                  ? `At least ${MIN_TAKEOVER_REASON} characters — the previous assignee sees this.`
                  : undefined
              }
              minRows={2}
              autosize
              required
            />
          }
          tone="warning"
          confirmLabel="Reassign to me"
          confirmIcon={<UserCog size={14} />}
          loading={isPending}
        />
      </>
    );
  }

  return (
    <>
      <Button
        size="xs"
        variant="light"
        color="blue"
        leftSection={<Hand size={12} />}
        onClick={open}
        loading={isPending}
        disabled={claimed}
      >
        {claimed ? "Claimed ✓" : "Claim Task"}
      </Button>
      <ConfirmModal
        opened={opened}
        onClose={close}
        onConfirm={handleClaim}
        title="Claim this task?"
        description={
          <Text size="sm" component="span">
            Claiming reserves this task for you. Here&apos;s the deal —
            {commitmentBullets}
          </Text>
        }
        hint={
          activeCount >= 3 ? (
            <Text size="sm" component="span">
              You already have <strong>{activeCount} tasks in flight</strong>.
              Finishing one first keeps your timers healthy — completed tasks
              are what count on the leaderboard.
            </Text>
          ) : undefined
        }
        tone="neutral"
        confirmLabel="Claim task"
        confirmIcon={<Hand size={14} />}
        loading={isPending}
      />
    </>
  );
}
