import { Stack, Text, ThemeIcon } from "@mantine/core";
import { ArrowRight, Sparkles } from "lucide-react";
import { MotionCard } from "@/components/animations";
import LinkButton from "@/components/LinkButton";

export default function ActiveTasksEmptyState() {
  return (
    <MotionCard
      hoverLift={false}
      withBorder
      radius="md"
      padding={32}
      style={{ textAlign: "center", borderStyle: "dashed" }}
    >
      <Stack gap="md" align="center">
        <ThemeIcon size={56} radius="xl" variant="light" color="blue">
          <Sparkles size={26} />
        </ThemeIcon>
        <Stack gap={4} align="center">
          <Text fw={600} fz="lg">
            No active tasks yet
          </Text>
          <Text c="dimmed" fz="sm" maw={360}>
            Pick up a PPT from the board to start earning. Tasks you claim will
            show up here.
          </Text>
        </Stack>
        <LinkButton
          href="/dashboard/ppts"
          variant="light"
          color="blue"
          rightSection={<ArrowRight size={14} />}
        >
          Browse PPT Board
        </LinkButton>
      </Stack>
    </MotionCard>
  );
}
