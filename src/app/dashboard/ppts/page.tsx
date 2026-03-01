import { LinearClient } from '@linear/sdk';
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import { Title, Text, SimpleGrid, Card, Badge, Alert, Group, Anchor } from "@mantine/core";

// Initialize Linear client
const linearClient = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY || 'dummy_key',
});

export default async function PPTsPage() {
  let issues: any[] = [];
  let error = null;

  try {
    // In a real scenario, you'd filter by a specific team, label (e.g. "PPT"), or unassigned status.
    // We are fetching the latest issues to display.
    const response = await linearClient.issues({
      first: 50,
      filter: {
        assignee: { null: true },
        state: { type: { eq: "unstarted" } }
      }
    });
    
    issues = response.nodes;
  } catch (e) {
    const err = e as Error;
    console.error("Failed to fetch Linear issues:", err);
    error = err.message || "Failed to fetch PPTs. Please check your LINEAR_API_KEY.";
  }

  return (
    <FadeIn>
      <div style={{ marginBottom: '2rem' }}>
        <Title order={1}>PPT Board</Title>
        <Text c="dimmed" mt="xs">
          Find available tasks labeled as PPT (Pay Per Task). Claim a task to earn its payout.
        </Text>
      </div>

      {error ? (
        <Alert color="red" title="Error" mb="xl">
          {error}
        </Alert>
      ) : (
        <StaggerContainer>
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
            {issues.length === 0 ? (
              <div style={{ gridColumn: '1 / -1' }}>
                <Card withBorder radius="md" padding="xl" ta="center">
                  <Text c="dimmed">No available PPTs at the moment. Check back later!</Text>
                </Card>
              </div>
            ) : (
              issues.map((issue) => {
                // Calculate a dummy PPT amount based on estimate, 
                // or use a custom field if you have the Custom Field ID.
                const pptEstimate = issue.estimate ? issue.estimate * 10 : 0;

                return (
                  <StaggerItem key={issue.id} className="h-full">
                    <Card withBorder radius="md" padding="lg" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
                      <Group justify="space-between" align="flex-start" mb="xs">
                        <Badge variant="light" color="blue">{issue.identifier}</Badge>
                        {pptEstimate > 0 ? (
                          <Text fw={700} c="green" fz="sm">${pptEstimate}</Text>
                        ) : (
                          <Text fz="sm" fw={500} c="dimmed">No Payout Set</Text>
                        )}
                      </Group>
                      
                      <Title order={4} size="h5" lineClamp={2} mb="xs">
                        {issue.title}
                      </Title>
                      <Text fz="sm" c="dimmed" lineClamp={3} mb="md">
                        {issue.description || 'No description provided.'}
                      </Text>
                      
                      <Group justify="space-between" mt="auto" pt="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                        <Text fz="xs" c="dimmed">
                          Complexity: {issue.estimate ? `${issue.estimate} pts` : 'Unestimated'}
                        </Text>
                        <Anchor href={issue.url} target="_blank" fz="sm" fw={500}>
                          View in Linear &rarr;
                        </Anchor>
                      </Group>
                    </Card>
                  </StaggerItem>
                );
              })
            )}
          </SimpleGrid>
        </StaggerContainer>
      )}
    </FadeIn>
  );
}