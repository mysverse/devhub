"use client";

import {
  Accordion,
  Avatar,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import Link from "next/link";

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
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={40} />
                <Table.Th>User</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Linked Accounts</Table.Th>
                {requiredDocuments.map((type) => (
                  <Table.Th key={type}>{type}</Table.Th>
                ))}
                <Table.Th>Payment</Table.Th>
                <Table.Th>Tasks</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((user) => {
                const coiDoc = user.signedDocuments.find(
                  (d) => d.documentType === "COI",
                );
                const coiEntries = coiDoc?.coiEntries ?? [];
                const hasCoiEntries = coiEntries.length > 0;

                return (
                  <Accordion.Item key={user.id} value={user.id}>
                    <Table.Tr>
                      <Table.Td>
                        {hasCoiEntries && (
                          <Accordion.Control
                            p={0}
                            style={{ width: 28, minHeight: 0 }}
                          />
                        )}
                      </Table.Td>
                      <Table.Td>
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
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={user.role === "ADMIN" ? "violet" : "blue"}
                          variant="light"
                          size="sm"
                        >
                          {user.role}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
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
                      </Table.Td>
                      {requiredDocuments.map((type) => {
                        const doc = user.signedDocuments.find(
                          (d) => d.documentType === type,
                        );
                        return (
                          <Table.Td key={type}>
                            {doc ? (
                              <Group gap="xs">
                                <Badge color="green" variant="light" size="sm">
                                  Signed
                                </Badge>
                                <Text size="xs" c="dimmed">
                                  {new Date(
                                    doc.signedAt,
                                  ).toLocaleDateString()}
                                </Text>
                              </Group>
                            ) : (
                              <Badge color="red" variant="light" size="sm">
                                Not Signed
                              </Badge>
                            )}
                          </Table.Td>
                        );
                      })}
                      <Table.Td>
                        <Text size="sm">
                          {PAYMENT_LABELS[user.paymentMethod] ??
                            user.paymentMethod}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{user.transactionCount}</Text>
                      </Table.Td>
                    </Table.Tr>
                    {hasCoiEntries && (
                      <Table.Tr>
                        <Table.Td colSpan={7 + requiredDocuments.length} p={0}>
                          <Accordion.Panel>
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
                          </Accordion.Panel>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Accordion.Item>
                );
              })}
            </Table.Tbody>
          </Table>
        </Accordion>
      </Card>
    </Stack>
  );
}
