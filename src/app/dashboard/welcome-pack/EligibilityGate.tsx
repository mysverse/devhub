import {
  Alert,
  Card,
  List,
  ListItem,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import Image from "next/image";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import LinkButton from "@/components/LinkButton";
import { checkWelcomePackEligibility } from "@/lib/welcome-pack-eligibility";
import OrderForm, {
  type OrderFormDefaults,
  type OrderFormPack,
} from "./OrderForm";

export default async function EligibilityGate({
  userId,
  pack,
  defaults,
}: {
  userId: string;
  pack: OrderFormPack;
  defaults: OrderFormDefaults;
}) {
  const eligibility = await checkWelcomePackEligibility(userId);

  if (eligibility.eligible && eligibility.wave) {
    return (
      <OrderForm
        pack={pack}
        defaults={defaults}
        wave={eligibility.wave as 1 | 2}
      />
    );
  }

  return (
    <Stack gap="xl">
      <Card withBorder radius="md" p="lg">
        <Stack gap="sm">
          <Title order={4}>Eligibility</Title>
          <Text c="dimmed">
            We send welcome packs in waves. Here&apos;s how it works:
          </Text>
          <List spacing="xs" size="sm">
            <ListItem>
              <strong>Wave 1 (now):</strong> any developer with a Linear issue
              completed in the last 6 months.
            </ListItem>
            <ListItem>
              <strong>Wave 2 (later):</strong> opens to everyone else when
              admins announce it.
            </ListItem>
          </List>

          {eligibility.needsLinearReauth ? (
            <Alert color="yellow" mt="xs" title="Reconnect Linear">
              We couldn&apos;t verify your Linear activity. Reconnect Linear so
              we can check Wave 1 eligibility.
              <Stack gap="xs" mt="sm">
                <LinkButton
                  href="/auth/reauth-linear?returnTo=/dashboard/welcome-pack"
                  variant="light"
                  w="fit-content"
                >
                  Reconnect Linear
                </LinkButton>
              </Stack>
            </Alert>
          ) : (
            <Alert color="blue" mt="xs" title="Not yet eligible">
              {eligibility.reason ??
                "You're not eligible for the welcome pack yet."}
            </Alert>
          )}
        </Stack>
      </Card>

      {pack.items.length > 0 && (
        <Stack gap="md">
          <Title order={4}>What&apos;s in the pack</Title>
          <StaggerContainer>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              {pack.items.map((item) => (
                <StaggerItem key={item.id}>
                  <Card withBorder radius="md" p="md" h="100%">
                    <Stack gap="xs">
                      {item.imageBlobUrl && (
                        <div style={{ position: "relative", height: 160 }}>
                          <Image
                            src={item.imageBlobUrl}
                            alt={item.name}
                            fill
                            style={{ objectFit: "cover", borderRadius: 6 }}
                          />
                        </div>
                      )}
                      <Text fw={600}>{item.name}</Text>
                      {item.description && (
                        <Text size="sm" c="dimmed">
                          {item.description}
                        </Text>
                      )}
                    </Stack>
                  </Card>
                </StaggerItem>
              ))}
            </SimpleGrid>
          </StaggerContainer>
        </Stack>
      )}
    </Stack>
  );
}
