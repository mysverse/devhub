import { Group, Text, Title } from "@mantine/core";

type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned slot: primary action button, status badge, or both. */
  action?: React.ReactNode;
};

/**
 * Page-level header (Title order=1). Render it OUTSIDE Suspense in the page's
 * sync shell so the title paints instantly on navigation; only the data below
 * it should stream. Section-level headers inside a page use
 * DashboardSectionHeader instead.
 *
 * Vertical rhythm comes from the parent PageContainer's Stack — no margins
 * here.
 */
export default function PageHeader({
  title,
  subtitle,
  action,
}: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="wrap">
      <div>
        <Title order={1}>{title}</Title>
        {subtitle && (
          <Text c="dimmed" mt="xs">
            {subtitle}
          </Text>
        )}
      </div>
      {action}
    </Group>
  );
}
