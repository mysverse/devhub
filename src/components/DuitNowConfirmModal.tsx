"use client";

/**
 * The "are you sure?" step before a DuitNow proxy ID is saved.
 *
 * Nothing offline can tell whether an ID was actually registered — that is the
 * failure this whole feature exists for, and the only thing that resolves it
 * is the bank's own lookup at payout time. So this asks the one person who
 * can know, restates exactly what we will do with the answer, and records it.
 *
 * The checklist gates the confirm button rather than sitting under it: an
 * acknowledgement nobody has to touch is an acknowledgement nobody reads.
 */

import {
  Anchor,
  Checkbox,
  Collapse,
  List,
  ListItem,
  Stack,
  Text,
} from "@mantine/core";
import { useEffect, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import {
  DUITNOW_ID_TYPES,
  type DuitNowIdType,
  formatDuitNowIdForDisplay,
} from "@/lib/duitnow-id";

type Props = {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  idType: DuitNowIdType;
  duitNowId: string;
  legalName: string | null;
  loading?: boolean;
};

export default function DuitNowConfirmModal({
  opened,
  onClose,
  onConfirm,
  idType,
  duitNowId,
  legalName,
  loading = false,
}: Props) {
  const [registered, setRegistered] = useState(false);
  const [ownName, setOwnName] = useState(false);
  const [showHow, setShowHow] = useState(false);

  // ConfirmModal neuters onClose while loading and does not own this state, so
  // reset here or a reopened modal shows the boxes already ticked.
  useEffect(() => {
    if (!opened) {
      setRegistered(false);
      setOwnName(false);
      setShowHow(false);
    }
  }, [opened]);

  const label =
    DUITNOW_ID_TYPES.find((entry) => entry.value === idType)?.label ??
    "DuitNow ID";
  const pretty = formatDuitNowIdForDisplay(idType, duitNowId);

  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={loading}
      confirmDisabled={!registered || !ownName}
      tone="warning"
      title="Is this DuitNow ID registered?"
      confirmLabel="Save DuitNow ID"
      cancelLabel="Go back"
      description={
        <Stack gap="xs">
          <Text size="sm">
            We pay you by searching for this ID in our bank:
          </Text>
          <Text size="sm" ff="monospace">
            {label} → <strong>{pretty}</strong>
          </Text>
          <Text size="sm">
            If it is not registered as a DuitNow ID, nothing comes up when we
            search, and your payout waits until you fix it.
          </Text>
        </Stack>
      }
      extra={
        <Stack gap="sm">
          <Checkbox
            checked={registered}
            onChange={(event) => setRegistered(event.currentTarget.checked)}
            label="I have registered this as a DuitNow ID in my bank or e-wallet app"
          />
          <Anchor
            component="button"
            type="button"
            size="xs"
            onClick={() => setShowHow((open) => !open)}
          >
            {showHow ? "Hide" : "How do I check?"}
          </Anchor>
          <Collapse expanded={showHow}>
            <List size="xs" spacing={4} c="dimmed">
              <ListItem>
                <strong>Maybank MAE / Maybank2u</strong> — Settings → Pay &amp;
                Transfer → Transfer → DuitNow
              </ListItem>
              <ListItem>
                <strong>CIMB OCTO</strong> — More → Services → Manage DuitNow →
                DuitNow ID
              </ListItem>
              <ListItem>
                <strong>Touch &rsquo;n Go eWallet</strong> — Profile → DuitNow →
                Link eWallet with DuitNow
              </ListItem>
              <ListItem>
                <strong>Boost</strong> — Profile → DuitNow (verified accounts
                only)
              </ListItem>
              <ListItem>
                <strong>ShopeePay</strong> — in the standalone ShopeePay app,
                not the main Shopee app
              </ListItem>
              <ListItem>
                Other banks — look for &ldquo;DuitNow&rdquo; or &ldquo;Manage
                DuitNow ID&rdquo; in your banking app, or ask your bank.
              </ListItem>
            </List>
          </Collapse>
          <Checkbox
            checked={ownName}
            onChange={(event) => setOwnName(event.currentTarget.checked)}
            label={
              legalName
                ? `It is registered to an account in my own name (${legalName})`
                : "It is registered to an account in my own name"
            }
          />
        </Stack>
      }
    />
  );
}
