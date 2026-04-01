import {
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
  Tooltip,
} from "@mantine/core";
import { FadeIn } from "@/components/animations";
import { estimateToAmount, formatAmount } from "@/lib/currency";
import prisma from "@/lib/prisma";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "yellow",
  APPROVED: "green",
  REJECTED: "red",
};

export default async function MyPptRequests({ userId }: { userId: string }) {
  const requests = await prisma.pptRequest.findMany({
    where: { requesterId: userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (requests.length === 0) return null;

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
                        <Text fz="sm" truncate="end" maw={250}>
                          {req.linearIssueTitle}
                        </Text>
                      </Group>
                    </TableTd>
                    <TableTd>
                      <Text fz="sm">
                        {req.requestedEstimate} &middot;{" "}
                        {formatAmount(
                          estimateToAmount(req.requestedEstimate, "MYR"),
                          "MYR",
                        )}
                      </Text>
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
                      {req.status === "REJECTED" && req.rejectionReason ? (
                        <Tooltip label={req.rejectionReason}>
                          <Badge size="sm" color={STATUS_COLORS[req.status]}>
                            {req.status}
                          </Badge>
                        </Tooltip>
                      ) : (
                        <Badge size="sm" color={STATUS_COLORS[req.status]}>
                          {req.status}
                        </Badge>
                      )}
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
      </Stack>
    </FadeIn>
  );
}
