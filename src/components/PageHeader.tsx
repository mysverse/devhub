import { Group, Text, Title } from "@mantine/core";
import PageTitleTransition from "@/components/PageTitleTransition";

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
 *
 * The subtitle renders as a `div`, not Mantine's default `p`. `subtitle` is a
 * ReactNode and pages legitimately pass block content — the PPT board and
 * Bonuses both pass a Stack wrapping a paragraph and a help-drawer trigger.
 * Inside a `p` that is invalid nesting, which React resolves by discarding and
 * regenerating the subtree on the client: a hydration error on every load of
 * those pages. A `div` can legally contain either a string or block content,
 * and looks identical (Mantine's reset zeroes paragraph margins, and the top
 * margin here is explicit).
 */
export default function PageHeader({
  title,
  subtitle,
  action,
}: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="wrap">
      <div>
        <PageTitleTransition>
          <Title order={1}>{title}</Title>
        </PageTitleTransition>
        {subtitle && (
          <Text component="div" c="dimmed" mt="xs">
            {subtitle}
          </Text>
        )}
      </div>
      {action}
    </Group>
  );
}
