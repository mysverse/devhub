import { Badge, Center, Stack, Text, Title } from "@mantine/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import {
  buildSocialMetadata,
  getSocialPreview,
  normalizeSocialPath,
} from "@/lib/social-previews";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function getTargetPath(searchParams: SearchParams | undefined) {
  const params = await searchParams;
  const target = params?.target;
  return normalizeSocialPath(Array.isArray(target) ? target[0] : target);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: SearchParams;
}): Promise<Metadata> {
  const targetPath = await getTargetPath(searchParams);
  return buildSocialMetadata(targetPath, { noIndex: true });
}

export default function SocialPreviewPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  return (
    <Suspense fallback={null}>
      <SocialPreviewContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SocialPreviewContent({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const targetPath = await getTargetPath(searchParams);
  const preview = getSocialPreview(targetPath);

  return (
    <Center mih="100vh" p="xl" bg="var(--mantine-color-dark-9)">
      <Stack gap="md" maw={560} ta="center" align="center">
        <Logo size={52} color="var(--mantine-color-gray-0)" />
        <Badge variant="light" color="blue">
          {preview.label}
        </Badge>
        <Title order={1}>{preview.title}</Title>
        <Text c="dimmed" size="lg">
          {preview.description}
        </Text>
      </Stack>
    </Center>
  );
}
