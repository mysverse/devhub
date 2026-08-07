import {
  Anchor,
  Badge,
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
import { FadeIn } from "@/components/animations";
import CampaignBadge from "@/components/CampaignBadge";
import LinkAnchor from "@/components/LinkAnchor";
import StatusBadge from "@/components/StatusBadge";
import type { CurrencyCode } from "@/lib/currency";
import { getCampaignBadgeFor } from "@/lib/payout-campaign-server";
import { projectPptPayout } from "@/lib/ppt-payout-presentation";
import prisma from "@/lib/prisma";
import { PPT_REQUEST_STATUS, statusCopy } from "@/lib/status-copy";

const PAGE_SIZE = 10;

export default async function MyPptRequests({
  userId,
  currency = "MYR",
  page = 1,
}: {
  userId: string;
  currency?: CurrencyCode;
  page?: number;
}) {
  // A request has no Linear issue yet, so labels are unknown and a
  // label-restricted campaign is deliberately not quoted here.
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { developerRank: true },
  });
  const campaign = await getCampaignBadgeFor({
    scope: "PPT",
    userId,
    rank: profile?.developerRank ?? null,
  });

  const [total, requests] = await Promise.all([
    prisma.pptRequest.count({ where: { requesterId: userId } }),
    prisma.pptRequest.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  if (total === 0) return null;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <FadeIn>
      <Stack gap="md">
        <Title order={3}>My PPT Requests</Title>
        <Card withBorder radius="md" padding={0}>
          <div style={{ overflowX: "auto" }}>
            <Table striped highlightOnHover verticalSpacing="sm" miw={500}>
              <TableThead>
                <TableTr>
                  <TableTh>Task</TableTh>
                  <TableTh>Complexity</TableTh>
                  <TableTh>Due Date</TableTh>
                  <TableTh>Status</TableTh>
                  <TableTh>Requested</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {requests.map((req) => (
                  <TableTr key={req.id}>
                    <TableTd>
                      <Group gap="xs" wrap="nowrap">
                        {req.linearIssueIdentifier && (
                          <Badge size="xs" variant="light" color="gray">
                            {req.linearIssueIdentifier}
                          </Badge>
                        )}
                        {!req.linearIssueId && (
                          <Badge size="xs" variant="light" color="blue">
                            New
                          </Badge>
                        )}
                        {req.linearIssueUrl ? (
                          <Anchor
                            href={req.linearIssueUrl}
                            target="_blank"
                            fz="sm"
                            truncate="end"
                            maw={250}
                          >
                            {req.linearIssueTitle}
                          </Anchor>
                        ) : (
                          <Text fz="sm" truncate="end" maw={250}>
                            {req.linearIssueTitle}
                          </Text>
                        )}
                      </Group>
                    </TableTd>
                    <TableTd>
                      <Group gap={6} wrap="nowrap">
                        <Text fz="sm">
                          {req.requestedEstimate} &middot;{" "}
                          {
                            projectPptPayout(
                              req.requestedEstimate,
                              currency,
                              campaign,
                            ).finalLabel
                          }
                        </Text>
                        {campaign && <CampaignBadge campaign={campaign} />}
                      </Group>
                    </TableTd>
                    <TableTd>
                      <Text fz="sm">
                        {req.projectedDueDate.toLocaleDateString("en-MY", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </Text>
                    </TableTd>
                    <TableTd>
                      <Stack gap={4}>
                        <StatusBadge
                          size="sm"
                          copy={statusCopy(PPT_REQUEST_STATUS, req.status)}
                        />
                        {req.status === "REJECTED" && (
                          <Text fz="xs" c="red" maw={280}>
                            {req.rejectionReason ??
                              "No reason recorded — you can adjust and re-submit, or ask an admin."}
                          </Text>
                        )}
                        {req.status === "APPROVED" && req.linearIssueUrl && (
                          <Anchor
                            href={req.linearIssueUrl}
                            target="_blank"
                            fz="xs"
                          >
                            Now live in Linear &rarr;
                          </Anchor>
                        )}
                      </Stack>
                    </TableTd>
                    <TableTd>
                      <Text fz="sm" c="dimmed">
                        {req.createdAt.toLocaleDateString("en-MY", {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    </TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </div>
        </Card>
        {pageCount > 1 && (
          <Group justify="space-between">
            <Text fz="sm" c="dimmed">
              Page {page} of {pageCount} &middot; {total} request
              {total === 1 ? "" : "s"}
            </Text>
            <Group gap="xs">
              {page > 1 && (
                <LinkAnchor
                  href={`/dashboard/ppts?requestsPage=${page - 1}`}
                  fz="sm"
                  fw={600}
                >
                  &larr; Newer
                </LinkAnchor>
              )}
              {page < pageCount && (
                <LinkAnchor
                  href={`/dashboard/ppts?requestsPage=${page + 1}`}
                  fz="sm"
                  fw={600}
                >
                  Older &rarr;
                </LinkAnchor>
              )}
            </Group>
          </Group>
        )}
      </Stack>
    </FadeIn>
  );
}
