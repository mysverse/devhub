"use client";

import { Anchor, Group, Image, Modal, Stack, Text } from "@mantine/core";
import { ExternalLink } from "lucide-react";
import { MODAL_TRANSITION, OVERLAY_PROPS } from "@/components/animations";

export type LightboxImage = {
  src: string;
  alt: string;
  /** Original (unproxied) URL, for "open in a new tab". */
  href?: string;
};

/**
 * Full-size view of an attachment image.
 *
 * Deliberately built on Mantine's Modal rather than hand-rolled: focus
 * trapping, Escape, scroll lock and return-focus all come for free and stay
 * correct. The app already carries one bespoke animated dialog
 * (AssistantOverlay); a second would be a second thing to get wrong.
 */
export default function ImageLightbox({
  image,
  onClose,
}: {
  image: LightboxImage | null;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={image !== null}
      onClose={onClose}
      title={image?.alt}
      centered
      size="auto"
      radius="md"
      padding="sm"
      transitionProps={MODAL_TRANSITION}
      overlayProps={{ ...OVERLAY_PROPS }}
    >
      {image && (
        <Stack gap="xs">
          <Image
            src={image.src}
            alt={image.alt}
            fit="contain"
            mah="75vh"
            maw="90vw"
            radius="sm"
          />
          {image.href && (
            <Group justify="flex-end">
              <Anchor
                href={image.href}
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
              >
                <Group gap={4} wrap="nowrap">
                  <Text size="xs">Open original</Text>
                  <ExternalLink size={12} />
                </Group>
              </Anchor>
            </Group>
          )}
        </Stack>
      )}
    </Modal>
  );
}
