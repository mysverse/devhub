"use client";

import { Badge, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { Check, Circle, CircleAlert } from "lucide-react";
import type { RequirementResult } from "@/lib/ppt-composer-config";

/**
 * The checklist that replaced the composer's red Textarea error.
 *
 * The old design put a red error under the textarea the moment someone typed
 * a single character, so the normal state of writing proof was "you are doing
 * it wrong". This shows the same rules as a list of things to reach, and only
 * turns red once a submit has actually been blocked (`showErrors`) — which is
 * the first moment the developer has expressed an intent the rule is refusing.
 */
export default function RequirementChecklist({
  title,
  results,
  showErrors,
}: {
  title: string;
  results: RequirementResult[];
  /** True after a blocked submit attempt. Nothing is red before that. */
  showErrors: boolean;
}) {
  return (
    <Stack gap={8}>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        {title}
      </Text>

      {results.map(({ requirement, met }) => {
        const blocking = showErrors && requirement.required && !met;
        const color = met ? "green" : blocking ? "red" : "gray";

        return (
          <Group key={requirement.id} gap="xs" wrap="nowrap" align="flex-start">
            <ThemeIcon
              size="sm"
              radius="xl"
              variant={met ? "filled" : "light"}
              color={color}
              mt={2}
            >
              {met ? (
                <Check size={12} />
              ) : blocking ? (
                <CircleAlert size={12} />
              ) : (
                <Circle size={10} />
              )}
            </ThemeIcon>

            <div style={{ flex: 1, minWidth: 0 }}>
              <Group gap={6} wrap="nowrap" align="center">
                <Text
                  size="sm"
                  fw={met ? 400 : 500}
                  c={blocking ? "red" : met ? "dimmed" : undefined}
                  td={met ? "line-through" : undefined}
                >
                  {requirement.label}
                </Text>
                {!requirement.required && (
                  <Badge size="xs" variant="light" color="gray">
                    optional
                  </Badge>
                )}
              </Group>
              {!met && (
                <Text size="xs" c="dimmed" style={{ lineHeight: 1.45 }}>
                  {requirement.hint}
                </Text>
              )}
            </div>
          </Group>
        );
      })}
    </Stack>
  );
}
