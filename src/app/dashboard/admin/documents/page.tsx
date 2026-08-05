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
} from "@mantine/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { requireAdminPage } from "@/lib/authz";
import { DISPLAY_NAME_SELECT, resolveDisplayName } from "@/lib/display-name";
import { REQUIRED_DOCUMENTS } from "@/lib/documents";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";

export const metadata: Metadata = buildSocialMetadata(
  "/dashboard/admin/documents",
);

export default function AdminDocumentsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Document Compliance"
        subtitle="Overview of all team members' document signing status."
        action={
          <LinkButton href="/dashboard/admin" variant="subtle">
            Back to Admin
          </LinkButton>
        }
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <AdminDocumentsContent />
      </Suspense>
    </PageContainer>
  );
}

async function AdminDocumentsContent() {
  await requireAdminPage();

  const users = await prisma.userProfile.findMany({
    select: {
      id: true,
      ...DISPLAY_NAME_SELECT,
      signedDocuments: {
        select: {
          id: true,
          documentType: true,
          signedAt: true,
          // The authoritative name for a signed document is the one on the
          // document, not today's profile column.
          legalName: true,
        },
      },
    },
    orderBy: { preferredName: "asc" },
  });

  return (
    <Stack gap="lg">
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
                    {resolveDisplayName({ profile: user })}
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
                          {/* The legal name shown here is the one captured on
                              the document itself — the authoritative record for
                              compliance — not the current profile column. */}
                          <Badge
                            color="green"
                            variant="light"
                            size="sm"
                            title={`Signed as ${doc.legalName}`}
                          >
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
