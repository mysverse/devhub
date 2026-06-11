import {
  Card,
  type CardProps,
  type MantineSpacing,
  Stack,
  Text,
  Title,
} from "@mantine/core";

type FormSectionProps = {
  title: string;
  /** Dimmed line under the title. */
  description?: React.ReactNode;
  /** The fields (or any section content). */
  children: React.ReactNode;
  /** Stack gap between fields. */
  gap?: MantineSpacing;
} & Pick<CardProps, "padding" | "style" | "mt">;

/**
 * Titled card section for forms and settings panels: Card + Title(order=3) +
 * optional description + Stack of fields.
 */
export default function FormSection({
  title,
  description,
  children,
  gap = "md",
  ...cardProps
}: FormSectionProps) {
  return (
    <Card withBorder {...cardProps}>
      <Title order={3} mb={description ? "xs" : "md"}>
        {title}
      </Title>
      {description && (
        <Text size="sm" c="dimmed" mb="lg">
          {description}
        </Text>
      )}
      <Stack gap={gap}>{children}</Stack>
    </Card>
  );
}
