"use client";

import {
  ActionIcon,
  Avatar,
  Badge,
  Card,
  Group,
  MenuItem,
  MenuLabel,
  Stack,
  TableTd,
  TableTh,
  TableTr,
  Text,
} from "@mantine/core";
import { ChevronDown, FileX, Mail, UserPen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { DURATION, EASE } from "@/components/animations";
import { RowActionsMenu, TableShell } from "@/components/DataTable";
import {
  DEVELOPER_RANK_LABELS,
  DEVELOPER_SPECIALTY_LABELS,
  type DeveloperRankValue,
  type DeveloperSpecialtyValue,
} from "@/lib/developer-access";
import { getPaymentMethodLabel } from "@/lib/payment-validation";
import {
  sendDocumentInvalidatedNotice,
  sendLegalNameReminder,
} from "../email-actions";

type CoiEntry = {
  id: string;
  organizationName: string;
  natureOfInvolvement: string;
  description: string;
};

type SignedDoc = {
  id: string;
  documentType: string;
  signedAt: string;
  coiEntries: CoiEntry[];
};

type UserRow = {
  id: string;
  legalName: string | null;
  role: string;
  developerRank: DeveloperRankValue;
  specialties: DeveloperSpecialtyValue[];
  paymentMethod: string;
  linearId: string | null;
  discordId: string | null;
  robloxId: string | null;
  userName: string;
  userEmail: string;
  userImage: string | null;
  transactionCount: number;
  signedDocuments: SignedDoc[];
};

function UserActions({
  user,
  requiredDocuments,
}: {
  user: UserRow;
  requiredDocuments: readonly string[];
}) {
  const [loading, setLoading] = useState(false);

  async function handleLegalNameReminder() {
    setLoading(true);
    const res = await sendLegalNameReminder(user.id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(`Legal name reminder sent to ${user.userEmail}`);
    }
    setLoading(false);
  }

  async function handleInvalidateDocument(documentType: string) {
    setLoading(true);
    const res = await sendDocumentInvalidatedNotice(user.id, documentType);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(
        `${documentType} invalidated and notification sent to ${user.userEmail}`,
      );
    }
    setLoading(false);
  }

  const signedDocs = user.signedDocuments.filter((d) =>
    requiredDocuments.includes(d.documentType),
  );

  return (
    <RowActionsMenu loading={loading}>
      <MenuLabel>Email Notifications</MenuLabel>
      <MenuItem
        leftSection={<UserPen size={14} />}
        onClick={handleLegalNameReminder}
      >
        Remind: Use Legal Name
      </MenuItem>
      {signedDocs.length > 0 && (
        <>
          <MenuLabel>Invalidate Document</MenuLabel>
          {signedDocs.map((doc) => (
            <MenuItem
              key={doc.documentType}
              leftSection={<FileX size={14} />}
              color="red"
              onClick={() => handleInvalidateDocument(doc.documentType)}
            >
              Invalidate {doc.documentType}
            </MenuItem>
          ))}
        </>
      )}
      <MenuLabel>Contact</MenuLabel>
      <MenuItem
        leftSection={<Mail size={14} />}
        component="a"
        href={`mailto:${user.userEmail}`}
      >
        Email Directly
      </MenuItem>
    </RowActionsMenu>
  );
}

export default function UsersTable({
  users,
  requiredDocuments,
}: {
  users: UserRow[];
  requiredDocuments: readonly string[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <Stack gap="lg">
      <Text c="dimmed" size="sm">
        {users.length} user{users.length !== 1 ? "s" : ""} registered
      </Text>

      <Card withBorder radius="md" padding={0}>
        <TableShell
          minWidth={800}
          striped
          layout="fixed"
          head={
            <TableTr>
              <TableTh style={{ width: 40 }} />
              <TableTh style={{ width: "20%" }}>User</TableTh>
              <TableTh style={{ width: 150 }}>Rank</TableTh>
              <TableTh style={{ width: "15%" }}>Linked Accounts</TableTh>
              {requiredDocuments.map((type) => (
                <TableTh key={type} style={{ width: "12%" }}>
                  {type}
                </TableTh>
              ))}
              <TableTh style={{ width: "10%" }}>Payment</TableTh>
              <TableTh style={{ width: 60 }}>Tasks</TableTh>
              <TableTh style={{ width: 50 }} />
            </TableTr>
          }
        >
          {users.map((user) => {
            const coiDoc = user.signedDocuments.find(
              (d) => d.documentType === "COI",
            );
            const coiEntries = coiDoc?.coiEntries ?? [];
            const hasCoiEntries = coiEntries.length > 0;
            const isExpanded = expanded.has(user.id);

            return (
              <Fragment key={user.id}>
                <TableTr>
                  <TableTd>
                    {hasCoiEntries && (
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={() => toggleExpanded(user.id)}
                        aria-label="Toggle conflicts of interest"
                      >
                        <ChevronDown
                          size={16}
                          style={{
                            transform: isExpanded
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                            transition:
                              "transform var(--duration-fast) var(--ease-out)",
                          }}
                        />
                      </ActionIcon>
                    )}
                  </TableTd>
                  <TableTd>
                    <Group gap="sm">
                      <Avatar
                        src={user.userImage}
                        alt={user.userName}
                        radius="xl"
                        size="sm"
                      />
                      <div>
                        <Text size="sm" fw={500}>
                          {user.legalName || user.userName}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {user.userEmail}
                        </Text>
                      </div>
                    </Group>
                  </TableTd>
                  <TableTd>
                    <Badge
                      color={user.role === "ADMIN" ? "violet" : "blue"}
                      variant="light"
                      size="sm"
                    >
                      {DEVELOPER_RANK_LABELS[user.developerRank]}
                    </Badge>
                    {user.specialties.length > 0 && (
                      <Group gap={4} mt={4}>
                        {user.specialties.map((specialty) => (
                          <Badge
                            key={specialty}
                            color="gray"
                            variant="outline"
                            size="xs"
                          >
                            {DEVELOPER_SPECIALTY_LABELS[specialty]}
                          </Badge>
                        ))}
                      </Group>
                    )}
                  </TableTd>
                  <TableTd>
                    <Group gap={4}>
                      {user.linearId && (
                        <Badge variant="dot" color="blue" size="xs">
                          Linear
                        </Badge>
                      )}
                      {user.discordId && (
                        <Badge variant="dot" color="indigo" size="xs">
                          Discord
                        </Badge>
                      )}
                      {user.robloxId && (
                        <Badge variant="dot" color="green" size="xs">
                          Roblox
                        </Badge>
                      )}
                      {!user.linearId && !user.discordId && !user.robloxId && (
                        <Text size="xs" c="dimmed">
                          None
                        </Text>
                      )}
                    </Group>
                  </TableTd>
                  {requiredDocuments.map((type) => {
                    const doc = user.signedDocuments.find(
                      (d) => d.documentType === type,
                    );
                    return (
                      <TableTd key={type}>
                        {doc ? (
                          <Group gap="xs">
                            <Badge color="green" variant="light" size="sm">
                              Signed
                            </Badge>
                            <Text size="xs" c="dimmed">
                              {new Date(doc.signedAt).toLocaleDateString()}
                            </Text>
                          </Group>
                        ) : (
                          <Badge color="red" variant="light" size="sm">
                            Not Signed
                          </Badge>
                        )}
                      </TableTd>
                    );
                  })}
                  <TableTd>
                    <Text size="sm">
                      {getPaymentMethodLabel(user.paymentMethod)}
                    </Text>
                  </TableTd>
                  <TableTd>
                    <Text size="sm">{user.transactionCount}</Text>
                  </TableTd>
                  <TableTd>
                    <UserActions
                      user={user}
                      requiredDocuments={requiredDocuments}
                    />
                  </TableTd>
                </TableTr>
                <AnimatePresence initial={false}>
                  {hasCoiEntries && isExpanded && (
                    <TableTr key={`${user.id}-coi`}>
                      <TableTd colSpan={8 + requiredDocuments.length} p={0}>
                        {/* Rows can't height-animate; the cell content
                                collapses instead. */}
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            duration: DURATION.fast,
                            ease: EASE.out,
                          }}
                          style={{ overflow: "hidden" }}
                        >
                          <Stack gap="xs" p="sm">
                            <Text size="sm" fw={600}>
                              Declared Conflicts of Interest (
                              {coiEntries.length})
                            </Text>
                            {coiEntries.map((entry) => (
                              <Card
                                key={entry.id}
                                withBorder
                                radius="sm"
                                padding="sm"
                              >
                                <Group justify="space-between" mb={4}>
                                  <Text size="sm" fw={500}>
                                    {entry.organizationName}
                                  </Text>
                                  <Badge
                                    variant="outline"
                                    size="xs"
                                    color="gray"
                                  >
                                    {entry.natureOfInvolvement}
                                  </Badge>
                                </Group>
                                <Text size="xs" c="dimmed">
                                  {entry.description}
                                </Text>
                              </Card>
                            ))}
                          </Stack>
                        </motion.div>
                      </TableTd>
                    </TableTr>
                  )}
                </AnimatePresence>
              </Fragment>
            );
          })}
        </TableShell>
      </Card>
    </Stack>
  );
}
