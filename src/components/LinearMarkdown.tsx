"use client";

import { Badge, Group, Image, Text, UnstyledButton } from "@mantine/core";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { LightboxImage } from "@/components/ImageLightbox";
import { isDurableImageUrl, proxiedImageUrl } from "@/lib/linear-assets";

/**
 * Renders a Linear comment or description body.
 *
 * Images are proxied so Linear-hosted attachments actually load, and are
 * clickable when `onImageClick` is supplied. This is the single place that
 * knows the proxy rule.
 */
export default function LinearMarkdown({
  children,
  onImageClick,
}: {
  children: string;
  onImageClick?: (image: LightboxImage) => void;
}) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        img: ({ src, alt }) => {
          if (typeof src !== "string") return null;

          const label = alt || "Attachment";
          const proxied = proxiedImageUrl(src);
          const durable = isDurableImageUrl(src);

          const picture = (
            <Image
              src={proxied}
              alt={label}
              loading="lazy"
              radius="sm"
              mah={320}
              w="auto"
              fit="contain"
            />
          );

          return (
            <span style={{ display: "block", margin: "0.5rem 0" }}>
              {onImageClick ? (
                <UnstyledButton
                  onClick={() =>
                    onImageClick({ src: proxied, alt: label, href: src })
                  }
                  aria-label={`View ${label} full size`}
                  style={{ display: "block", width: "fit-content" }}
                >
                  {picture}
                </UnstyledButton>
              ) : (
                picture
              )}
              {!durable && (
                <Group gap={6} mt={4}>
                  <Badge size="xs" variant="light" color="orange">
                    external
                  </Badge>
                  <Text size="xs" c="dimmed">
                    Hosted outside DevHub — this link may stop working.
                  </Text>
                </Group>
              )}
            </span>
          );
        },
      }}
    >
      {children}
    </Markdown>
  );
}
