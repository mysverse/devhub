import { Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";

type Props = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
};

export default function DashboardSectionHeader({
  title,
  subtitle,
  action,
  badge,
  icon,
}: Props) {
  return (
    <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        {icon && (
          <ThemeIcon variant="light" color="blue" size={32} radius="md">
            {icon}
          </ThemeIcon>
        )}
        <Stack gap={2}>
          <Group gap="xs" align="center" wrap="wrap">
            <Title
              order={2}
              fz={{ base: "h3", sm: "h2" }}
              fw={700}
              style={{ letterSpacing: 0 }}
            >
              {title}
            </Title>
            {badge}
          </Group>
          {subtitle && (
            <Text fz="sm" c="dimmed">
              {subtitle}
            </Text>
          )}
        </Stack>
      </Group>
      {action}
    </Group>
  );
}
