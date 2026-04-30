import {
  Alert,
  Card,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { Hourglass, Sparkles } from "lucide-react";
import LinkButton from "@/components/LinkButton";
import { checkWelcomePackEligibility } from "@/lib/welcome-pack-eligibility";
import OrderForm, {
  type OrderFormDefaults,
  type OrderFormPack,
} from "./OrderForm";
import PackItemsPreview from "./PackItemsPreview";

export default async function EligibilityGate({
  userId,
  pack,
  defaults,
  wave2Open,
}: {
  userId: string;
  pack: OrderFormPack;
  defaults: OrderFormDefaults;
  wave2Open: boolean;
}) {
  const eligibility = await checkWelcomePackEligibility(userId, wave2Open);

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
        <Stack gap="md">
          <Title order={4}>Eligibility</Title>
          <Text c="dimmed">
            We send welcome packs in waves. Here&apos;s how it works:
          </Text>

          <Stack gap="sm">
            <WaveRow
              wave={1}
              icon={<Sparkles size={18} />}
              color="teal"
              title="Wave 1 — Open now"
              body="Any developer with a Linear issue completed in the last 6 months."
            />
            <WaveRow
              wave={2}
              icon={<Hourglass size={18} />}
              color={wave2Open ? "blue" : "gray"}
              title={wave2Open ? "Wave 2 — Open now" : "Wave 2 — Coming later"}
              body={
                wave2Open
                  ? "Open to everyone else."
                  : "Opens to everyone else when admins announce it."
              }
            />
          </Stack>

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
          <Text c="dimmed" size="sm" mt={-6}>
            A preview of what eligible developers get to claim.
          </Text>
          <PackItemsPreview
            items={pack.items.map((item) => ({
              id: item.id,
              name: item.name,
              description: item.description,
              imageBlobUrl: item.imageBlobUrl,
            }))}
          />
        </Stack>
      )}
    </Stack>
  );
}

function WaveRow({
  icon,
  color,
  title,
  body,
}: {
  wave: 1 | 2;
  icon: React.ReactNode;
  color: string;
  title: string;
  body: string;
}) {
  return (
    <Group
      align="flex-start"
      wrap="nowrap"
      gap="md"
      p="sm"
      style={{
        backgroundColor: "var(--mantine-color-dark-7)",
        borderRadius: "var(--mantine-radius-md)",
      }}
    >
      <ThemeIcon
        color={color}
        variant="light"
        size={36}
        radius="md"
        style={{ flexShrink: 0 }}
      >
        {icon}
      </ThemeIcon>
      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
        <Text fw={600}>{title}</Text>
        <Text size="sm" c="dimmed">
          {body}
        </Text>
      </Stack>
    </Group>
  );
}
