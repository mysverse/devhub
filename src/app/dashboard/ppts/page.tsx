import { LinearClient, Issue } from "@linear/sdk";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import {
  Title,
  Text,
  SimpleGrid,
  Card,
  Badge,
  Alert,
  Group,
  Anchor,
  Image,
  CardSection,
  Skeleton,
} from "@mantine/core";
import { Suspense } from "react";

// Initialize Linear client
const linearClient = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY || "dummy_key",
});

function extractFirstImage(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  const match = markdown.match(/!\[.*?\]\((https?:\/\/.*?)\)/);
  return match ? match[1] : null;
}

function PPTSkeleton() {
  return (
    <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
      {[...Array(6)].map((_, i) => (
        <Card key={i} withBorder radius="md" padding="lg">
          <Skeleton height={160} mb="md" />
          <Group justify="space-between" mb="xs">
            <Skeleton height={20} width={60} />
            <Skeleton height={20} width={40} />
          </Group>
          <Skeleton height={24} mb="xs" />
          <Skeleton height={14} mb={4} />
          <Skeleton height={14} mb={4} />
          <Skeleton height={14} mb="md" width="70%" />
          <Group
            justify="space-between"
            mt="auto"
            pt="md"
            style={{
              borderTop: "1px solid var(--mantine-color-default-border)",
            }}
          >
            <Skeleton height={12} width={80} />
            <Skeleton height={12} width={60} />
          </Group>
        </Card>
      ))}
    </SimpleGrid>
  );
}

async function PPTList() {
  let issues: Issue[] = [];
  try {
    const response = await linearClient.issues({
      first: 50,
      filter: {
        assignee: { null: true },
        state: { type: { eq: "unstarted" } },
      },
    });
    issues = response.nodes;
  } catch (e) {
    const err = e as Error;
    console.error("Failed to fetch Linear issues:", err);
    return (
      <Alert color="red" title="Error" mb="xl">
        {err.message ||
          "Failed to fetch PPTs. Please check your LINEAR_API_KEY."}
      </Alert>
    );
  }

  if (issues.length === 0) {
    return (
      <Card withBorder radius="md" padding="xl" ta="center">
        <Text c="dimmed">
          No available PPTs at the moment. Check back later!
        </Text>
      </Card>
    );
  }

  return (
    <FadeIn>
      <StaggerContainer>
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
          {issues.map((issue) => {
            const pptEstimate = issue.estimate ? issue.estimate * 10 : 0;
            const imageUrl = extractFirstImage(issue.description);

            return (
              <StaggerItem key={issue.id} className="h-full">
                <Card
                  withBorder
                  radius="md"
                  padding="lg"
                  h="100%"
                  style={{ display: "flex", flexDirection: "column" }}
                >
                  {imageUrl && (
                    <CardSection mb="md">
                      <Image src={imageUrl} height={160} alt={issue.title} />
                    </CardSection>
                  )}

                  <Group justify="space-between" align="flex-start" mb="xs">
                    <Badge variant="light" color="blue">
                      {issue.identifier}
                    </Badge>
                    {pptEstimate > 0 ? (
                      <Text fw={700} c="green" fz="sm">
                        ${pptEstimate}
                      </Text>
                    ) : (
                      <Text fz="sm" fw={500} c="dimmed">
                        No Payout Set
                      </Text>
                    )}
                  </Group>

                  <Title order={4} size="h5" lineClamp={2} mb="xs">
                    {issue.title}
                  </Title>
                  <Text fz="sm" c="dimmed" lineClamp={3} mb="md">
                    {issue.description
                      ? issue.description.replace(/!\[.*?\]\(.*?\)/g, "").trim()
                      : "No description provided."}
                  </Text>

                  <Group
                    justify="space-between"
                    mt="auto"
                    pt="md"
                    style={{
                      borderTop:
                        "1px solid var(--mantine-color-default-border)",
                    }}
                  >
                    <Text fz="xs" c="dimmed">
                      Complexity:{" "}
                      {issue.estimate ? `${issue.estimate} pts` : "Unestimated"}
                    </Text>
                    <Anchor href={issue.url} target="_blank" fz="sm" fw={500}>
                      View in Linear &rarr;
                    </Anchor>
                  </Group>
                </Card>
              </StaggerItem>
            );
          })}
        </SimpleGrid>
      </StaggerContainer>
    </FadeIn>
  );
}

export default function PPTsPage() {
  return (
    <FadeIn>
      <div style={{ marginBottom: "2rem" }}>
        <Title order={1}>PPT Board</Title>
        <Text c="dimmed" mt="xs">
          Find available tasks labeled as PPT (Pay Per Task). Claim a task to
          earn its payout.
        </Text>
      </div>

      <Suspense fallback={<PPTSkeleton />}>
        <PPTList />
      </Suspense>
    </FadeIn>
  );
}
