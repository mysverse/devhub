"use client";

import { Anchor, Badge, Card, Group, Stack, Text, Title } from "@mantine/core";
import { motion } from "motion/react";
import { SPRING } from "@/components/animations";
import { countryNameFromCode } from "@/lib/countries";
import IdCardPreview from "../IdCardPreview";
import type { OrderFormPack } from "../OrderForm";
import type { OrderDraft } from "../useOrderDraft";

export default function ReviewStep({
  pack,
  draft,
  onEdit,
}: {
  pack: OrderFormPack;
  draft: OrderDraft;
  /** Jump back to a wizard step (always allowed backwards). */
  onEdit: (step: number) => void;
}) {
  const cards: { title: string; step: number; content: React.ReactNode }[] = [
    {
      title: "Pack contents",
      step: 0,
      content: (
        <Stack gap="xs">
          {pack.items.map((item) => (
            <Group key={item.id} justify="space-between">
              <Text size="sm">{item.name}</Text>
              <Text size="sm" c="dimmed">
                {item.requiresSize
                  ? (draft.selectedSizes[item.id] ?? "—")
                  : "Included"}
              </Text>
            </Group>
          ))}
        </Stack>
      ),
    },
    {
      title: "ID card",
      step: 1,
      content: (
        <Stack gap="xs">
          <Text size="sm">{draft.idCardName || "—"}</Text>
          {pack.idCardTemplateBlobUrl && (
            <div style={{ maxWidth: 240 }}>
              <IdCardPreview
                templateUrl={pack.idCardTemplateBlobUrl}
                templateWidth={pack.idCardWidth}
                templateHeight={pack.idCardHeight}
                nameX={pack.idCardNameX}
                nameY={pack.idCardNameY}
                fontSize={pack.idCardFontSize}
                fontColor={pack.idCardFontColor}
                fontFamily={pack.idCardFontFamily}
                nameMaxWidth={pack.idCardNameMaxWidth}
                nameMaxHeight={pack.idCardNameMaxHeight}
                nameAlign={pack.idCardNameAlign}
                nameWrapMode={pack.idCardNameWrapMode}
                name={draft.idCardName}
              />
            </div>
          )}
        </Stack>
      ),
    },
    {
      title: "Shipping",
      step: 2,
      content: (
        <Stack gap="xs">
          <Text size="sm">{draft.recipientName}</Text>
          <Text size="sm" c="dimmed">
            {draft.phone}
          </Text>
          <Text size="sm" style={{ whiteSpace: "pre-line" }}>
            {[
              draft.addressLine1,
              draft.addressLine2,
              [draft.city, draft.stateProvince].filter(Boolean).join(", "),
              [draft.postalCode, countryNameFromCode(draft.country)]
                .filter(Boolean)
                .join(" "),
            ]
              .filter(Boolean)
              .join("\n")}
          </Text>
          <Badge variant="light" color="cyan" w="fit-content">
            {draft.region === "DOMESTIC" ? "Domestic — MY" : "International"}
          </Badge>
        </Stack>
      ),
    },
  ];
  if (draft.notes) {
    cards.push({
      title: "Notes",
      step: 2,
      content: <Text size="sm">{draft.notes}</Text>,
    });
  }

  return (
    <Stack gap="md">
      <Text c="dimmed">
        Last chance to verify everything. After submission, the order is locked
        while admins prepare and ship it.
      </Text>

      {cards.map((card, idx) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING.soft, delay: idx * 0.06 }}
        >
          <Card withBorder radius="md" p="md">
            <Stack gap="xs">
              <Group justify="space-between" align="baseline">
                <Title order={5}>{card.title}</Title>
                <Anchor
                  component="button"
                  type="button"
                  size="sm"
                  onClick={() => onEdit(card.step)}
                >
                  Edit
                </Anchor>
              </Group>
              {card.content}
            </Stack>
          </Card>
        </motion.div>
      ))}
    </Stack>
  );
}
