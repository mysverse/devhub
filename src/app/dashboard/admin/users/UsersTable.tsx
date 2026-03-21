"use client";

import {
  Accordion,
  AccordionControl,
  AccordionItem,
  AccordionPanel,
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  MenuDropdown,
  MenuItem,
  MenuLabel,
  MenuTarget,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import { EllipsisVertical, FileX, Mail, UserPen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
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

const PAYMENT_LABELS: Record<string, string> = {
  PAYPAL: "PayPal",
  DUITNOW: "DuitNow",
  ROBUX: "Robux",
  BANK_TRANSFER: "Bank Transfer",
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
    <Menu shadow="md" width={220} position="bottom-end">
      <MenuTarget>
        <ActionIcon variant="subtle" color="gray" loading={loading} size="sm">
          <EllipsisVertical size={16} />
        </ActionIcon>
      </MenuTarget>
      <MenuDropdown>
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
      </MenuDropdown>
    </Menu>
  );
}

export default function UsersTable({
  users,
  requiredDocuments,
}: {
  users: UserRow[];
  requiredDocuments: readonly string[];
}) {
  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Team Members</Title>
          <Text c="dimmed" size="sm" mt={4}>
            {users.length} user{users.length !== 1 ? "s" : ""} registered
          </Text>
        </div>
        <Button component={Link} href="/dashboard/admin" variant="subtle">
          Back to Admin
        </Button>
      </Group>

      <Card withBorder radius="md" padding={0}>
        <Accordion chevronPosition="left" multiple>
          <Table striped highlightOnHover>
            <TableThead>
              <TableTr>
                <TableTh w={40} />
                <TableTh>User</TableTh>
                <TableTh>Role</TableTh>
                <TableTh>Linked Accounts</TableTh>
                {requiredDocuments.map((type) => (
                  <TableTh key={type}>{type}</TableTh>
                ))}
                <TableTh>Payment</TableTh>
                <TableTh>Tasks</TableTh>
                <TableTh w={50} />
              </TableTr>
            </TableThead>
            <TableTbody>
              {users.map((user) => {
                const coiDoc = user.signedDocuments.find(
                  (d) => d.documentType === "COI",
                );
                const coiEntries = coiDoc?.coiEntries ?? [];
                const hasCoiEntries = coiEntries.length > 0;

                return (
                  <AccordionItem key={user.id} value={user.id}>
                    <TableTr>
                      <TableTd>
                        {hasCoiEntries && (
                          <AccordionControl
                            p={0}
                            style={{ width: 28, minHeight: 0 }}
                          />
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
                          {user.role}
                        </Badge>
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
                          {!user.linearId &&
                            !user.discordId &&
                            !user.robloxId && (
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
                          {PAYMENT_LABELS[user.paymentMethod] ??
                            user.paymentMethod}
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
                    {hasCoiEntries && (
                      <TableTr>
                        <TableTd colSpan={8 + requiredDocuments.length} p={0}>
                          <AccordionPanel>
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
                          </AccordionPanel>
                        </TableTd>
                      </TableTr>
                    )}
                  </AccordionItem>
                );
              })}
            </TableTbody>
          </Table>
        </Accordion>
      </Card>
    </Stack>
  );
}
