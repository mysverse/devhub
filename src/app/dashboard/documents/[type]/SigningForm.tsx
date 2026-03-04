"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Stack,
  Text,
  Title,
  TypographyStylesProvider,
} from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { signDocument } from "../actions";

type Props = {
  documentType: string;
  title: string;
  content: string;
  legalName: string | null;
  signed: boolean;
  signedAt: string | null;
  signedDocumentId: string | null;
};

export default function SigningForm({
  documentType,
  title,
  content,
  legalName,
  signed,
  signedAt,
  signedDocumentId,
}: Props) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSign() {
    if (!agreed) {
      toast.error("Please check the agreement box to continue.");
      return;
    }

    setLoading(true);
    const result = await signDocument(documentType);
    setLoading(false);

    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success(`${title} signed successfully.`);
      router.push("/dashboard/documents");
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap="sm">
          <Button
            component={Link}
            href="/dashboard/documents"
            variant="subtle"
            size="sm"
          >
            Back to Documents
          </Button>
        </Group>
        {signed && signedDocumentId && (
          <Button
            component="a"
            href={`/api/documents/${signedDocumentId}/pdf`}
            variant="light"
            size="sm"
          >
            Download PDF
          </Button>
        )}
      </Group>

      <Group gap="sm">
        <Title order={2}>{title}</Title>
        {signed && (
          <Badge color="green" variant="light" size="lg">
            Signed
          </Badge>
        )}
      </Group>

      {signed && signedAt && (
        <Text size="sm" c="dimmed">
          Signed on{" "}
          {new Date(signedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      )}

      <Card withBorder radius="md" padding="xl">
        <TypographyStylesProvider>
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </TypographyStylesProvider>
      </Card>

      {!signed && (
        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
            {!legalName && (
              <Alert color="yellow" title="Legal name required">
                You need to set your legal name in{" "}
                <Text
                  component={Link}
                  href="/dashboard/settings"
                  c="blue"
                  inherit
                >
                  HR Settings
                </Text>{" "}
                before signing this document.
              </Alert>
            )}

            <Checkbox
              label={`I, ${legalName ?? "[Legal Name]"}, have read and agree to this ${title}.`}
              checked={agreed}
              onChange={(e) => setAgreed(e.currentTarget.checked)}
              disabled={!legalName}
            />

            <Group justify="flex-end">
              <Button
                onClick={handleSign}
                loading={loading}
                disabled={!legalName || !agreed}
              >
                Sign Document
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
