import { type MantineSpacing, Stack } from "@mantine/core";
import { FadeIn } from "@/components/animations";

type PageContainerProps = {
  children: React.ReactNode;
  /** Gap between page sections. Default "xl" (2rem). */
  gap?: MantineSpacing;
  /** Entrance animation. Disable when something else animates the page in. */
  animated?: boolean;
};

/**
 * Standard page shell: entrance fade + vertical rhythm between sections.
 *
 *   <PageContainer>
 *     <PageHeader title="…" action={…} />
 *     <Suspense fallback={<PageSkeleton />}>{content}</Suspense>
 *   </PageContainer>
 *
 * Spacing hierarchy: "xl" between page sections (this Stack), "md" within
 * cards, 2–4px for label/value pairs. Max-width comes from the dashboard
 * AppShell's Container — not from here.
 */
export default function PageContainer({
  children,
  gap = "xl",
  animated = true,
}: PageContainerProps) {
  const stack = <Stack gap={gap}>{children}</Stack>;
  return animated ? <FadeIn>{stack}</FadeIn> : stack;
}
