"use client";

import {
  Badge,
  Card,
  Drawer,
  Group,
  List,
  ListItem,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ArrowRight, HelpCircle } from "lucide-react";
import { WEEKLY_CREDIT_LIMITS } from "@/lib/credit-limit";
import type { CurrencyCode } from "@/lib/currency";
import { formatAmount } from "@/lib/currency";

type Props = { currency: CurrencyCode };

export default function HelpDrawer({ currency }: Props) {
  const [opened, { open, close }] = useDisclosure(false);
  const multiplier = currency === "MYR" ? 20 : 1200;
  const limit = WEEKLY_CREDIT_LIMITS[currency];
  const points = [1, 2, 3, 4, 5];

  return (
    <>
      <UnstyledButton
        onClick={open}
        style={{
          color: "inherit",
          display: "inline-flex",
          width: "fit-content",
        }}
      >
        <Group gap={6}>
          <HelpCircle size={14} />
          <Text fz="sm" c="blue.4" fw={500}>
            How payouts work
          </Text>
          <ArrowRight size={12} />
        </Group>
      </UnstyledButton>

      <Drawer
        opened={opened}
        onClose={close}
        position="right"
        size="md"
        title="How payouts work"
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
        transitionProps={{
          transition: "slide-left",
          duration: 260,
          timingFunction: "ease-out",
        }}
      >
        <Stack gap="xl">
          <Card withBorder radius="md" padding="lg">
            <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
              Earning PPTs
            </Text>
            <Stack gap="sm">
              <Text fz="sm">
                A Linear issue generates a payout when all of these are met:
              </Text>
              <List size="sm" spacing="xs">
                <ListItem>
                  Issue has a{" "}
                  <Badge size="xs" variant="light">
                    PPT
                  </Badge>{" "}
                  label
                </ListItem>
                <ListItem>
                  Issue has a complexity estimate (1-5 points)
                </ListItem>
                <ListItem>Issue is marked as completed</ListItem>
                <ListItem>Issue is assigned to you</ListItem>
                <ListItem>
                  You post a recent <strong>#ppt-proof</strong> comment with
                  what changed, proof links/screenshots, location, and
                  verification notes
                </ListItem>
                <ListItem>
                  The issue stays completed through the payout stability window
                </ListItem>
              </List>
              <Text fz="sm" fw={600} mt="xs">
                Payout per point
              </Text>
              <Group gap="xs" wrap="wrap">
                {points.map((pt) => (
                  <Badge key={pt} variant="light" color="blue" size="lg">
                    {pt}pt = {formatAmount(pt * multiplier, currency)}
                  </Badge>
                ))}
              </Group>
              <Text fz="xs" c="dimmed" mt="xs">
                <strong>Pending PPTs</strong> = pending transactions + estimated
                value of your active tasks. <strong>Total Earned</strong> = sum
                of all paid transactions.
              </Text>
            </Stack>
          </Card>

          <Card withBorder radius="md" padding="lg">
            <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
              Automated Payouts
            </Text>
            <Stack gap="sm">
              <Text fz="sm">
                Payouts within the weekly credit limit are auto-approved and
                paid after proof and the stability window pass. Payouts that
                exceed the limit stay pending for manual admin review.
              </Text>
              <List size="sm" spacing="xs">
                <ListItem>
                  Weekly limit: <strong>{formatAmount(limit, currency)}</strong>
                </ListItem>
                <ListItem>Week runs Monday to Sunday (UTC)</ListItem>
                <ListItem>
                  Pending and paid PPT transactions count toward the limit
                </ListItem>
                <ListItem>
                  If a task moves from Done back to In Progress, unpaid payouts
                  are held until it is completed again with fresh proof
                </ListItem>
              </List>
              <Text fz="xs" c="dimmed" mt="xs">
                Your weekly limit resets every Monday (UTC). The ring on your
                hero shows current usage.
              </Text>
            </Stack>
          </Card>
        </Stack>
      </Drawer>
    </>
  );
}
