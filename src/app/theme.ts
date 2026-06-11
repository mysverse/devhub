import { createTheme } from "@mantine/core";

/**
 * App-wide Mantine theme.
 *
 * UI conventions (enforced by defaultProps below where possible):
 * - Spacing rhythm: `gap="xl"` between page sections, `gap="md"` within cards,
 *   `gap={2..4}` for label/value pairs.
 * - Secondary text uses `c="dimmed"`, not raw gray shades like `c="gray.4"`.
 * - Cards: `radius="md" padding="lg"` (theme default) — override only with reason.
 * - ThemeIcon: `radius="md"` (theme default); circular empty-state icons use
 *   `radius="xl"` explicitly.
 * - Status badge colors come from `src/lib/status-copy.ts`, never hardcoded.
 * - Animation timing/easing comes from `src/components/animations.tsx` (Motion)
 *   and the matching CSS vars in `src/app/globals.css`.
 */
export const theme = createTheme({
  primaryColor: "blue",
  respectReducedMotion: true,
  fontFamily: "var(--font-geist-sans), sans-serif",
  fontFamilyMonospace: "var(--font-geist-mono), monospace",
  headings: {
    fontFamily: "var(--font-geist-sans), sans-serif",
  },
  components: {
    // Plain config objects, not Card.extend(): this file is imported from a
    // server component, where Mantine components are client-reference proxies
    // without their static methods.
    Card: {
      defaultProps: { radius: "md", padding: "lg" },
    },
    ThemeIcon: {
      defaultProps: { radius: "md" },
    },
  },
});
