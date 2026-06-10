import {
  Badge,
  Button,
  Card,
  Group,
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
import type { Metadata } from "next";
import { Suspense } from "react";
import LinkButton from "@/components/LinkButton";
import PageSkeleton from "@/components/PageSkeleton";
import { requireAdminPage } from "@/lib/authz";
import { REQUIRED_DOCUMENTS } from "@/lib/documents";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";

export const metadata: Metadata = buildSocialMetadata(
  "/dashboard/admin/documents",
);

export default function AdminDocumentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminDocumentsContent />
    </Suspense>
  );
}

async function AdminDocumentsContent() {
  await requireAdminPage();

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
        <LinkButton href="/dashboard/admin" variant="subtle">
          Back to Admin
        </LinkButton>
      </Group>
      <Text c="dimmed">
        Overview of all team members&apos; document signing status.
      </Text>

      <Card withBorder radius="md" padding={0}>
        <Table striped highlightOnHover>
          <TableThead>
            <TableTr>
              <TableTh>Name</TableTh>
              {REQUIRED_DOCUMENTS.map((type) => (
                <TableTh key={type}>{type}</TableTh>
              ))}
            </TableTr>
          </TableThead>
          <TableTbody>
            {users.map((user) => (
              <TableTr key={user.id}>
                <TableTd>
                  <Text size="sm" fw={500}>
                    {user.legalName || "No name set"}
                  </Text>
                </TableTd>
                {REQUIRED_DOCUMENTS.map((type) => {
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
                    </TableTd>
                  );
                })}
              </TableTr>
            ))}
          </TableTbody>
        </Table>
      </Card>
    </Stack>
  );
}
