import { auth } from "@clerk/nextjs/server";
import {
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
import { redirect } from "next/navigation";
import { REQUIRED_DOCUMENTS } from "@/lib/documents";
import prisma from "@/lib/prisma";

export default async function AdminDocumentsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!userProfile || userProfile.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const users = await prisma.userProfile.findMany({
    select: {
      id: true,
      legalName: true,
      signedDocuments: {
        select: {
          id: true,
          documentType: true,
          signedAt: true,
        },
      },
    },
    orderBy: { legalName: "asc" },
  });

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Document Compliance</Title>
        <Button component={Link} href="/dashboard/admin" variant="subtle">
          Back to Admin
        </Button>
      </Group>
      <Text c="dimmed">
        Overview of all team members&apos; document signing status.
      </Text>

      <Card withBorder radius="md" padding={0}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              {REQUIRED_DOCUMENTS.map((type) => (
                <Table.Th key={type}>{type}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((user) => (
              <Table.Tr key={user.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {user.legalName || "No name set"}
                  </Text>
                </Table.Td>
                {REQUIRED_DOCUMENTS.map((type) => {
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
                            {new Date(doc.signedAt).toLocaleDateString()}
                          </Text>
                          <Button
                            component="a"
                            href={`/api/documents/${doc.id}/pdf`}
                            variant="subtle"
                            size="xs"
                          >
                            PDF
                          </Button>
                        </Group>
                      ) : (
                        <Badge color="red" variant="light" size="sm">
                          Not Signed
                        </Badge>
                      )}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
