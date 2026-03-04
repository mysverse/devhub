"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  TypographyStylesProvider,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { signDocument } from "../actions";

type CoiDraft = {
  organizationName: string;
  natureOfInvolvement: string;
  description: string;
};

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
  const [coiEntries, setCoiEntries] = useState<CoiDraft[]>([]);

  const isCoi = documentType === "COI";

  async function handleSign() {
    if (!agreed) {
      toast.error("Please check the agreement box to continue.");
      return;
    }

    setLoading(true);
    const result = await signDocument(
      documentType,
      isCoi && coiEntries.length > 0 ? coiEntries : undefined,
    );
    setLoading(false);

    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success(`${title} signed successfully.`);
      router.push("/dashboard/documents");
    }
  }

  function addEntry(entry: CoiDraft) {
    setCoiEntries((prev) => [...prev, entry]);
  }

  function removeEntry(index: number) {
    setCoiEntries((prev) => prev.filter((_, i) => i !== index));
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
        <>
          {isCoi && (
            <CoiEntriesEditor
              entries={coiEntries}
              onAdd={addEntry}
              onRemove={removeEntry}
            />
          )}

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
        </>
      )}
    </Stack>
  );
}

function CoiEntriesEditor({
  entries,
  onAdd,
  onRemove,
}: {
  entries: CoiDraft[];
  onAdd: (entry: CoiDraft) => void;
  onRemove: (index: number) => void;
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const [orgName, setOrgName] = useState("");
  const [involvement, setInvolvement] = useState("");
  const [description, setDescription] = useState("");

  function resetForm() {
    setOrgName("");
    setInvolvement("");
    setDescription("");
  }

  function handleAdd() {
    if (!orgName.trim() || !involvement.trim() || !description.trim()) {
      toast.error("All fields are required.");
      return;
    }

    onAdd({
      organizationName: orgName.trim(),
      natureOfInvolvement: involvement.trim(),
      description: description.trim(),
    });
    resetForm();
    close();
  }

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Competing Commitments</Text>
          <Button size="xs" variant="light" onClick={open}>
            Add Entry
          </Button>
        </Group>

        <Text size="sm" c="dimmed">
          If you have any competing commitments, add them here before signing.
          You can also add them later from the documents page.
        </Text>

        {entries.length > 0 && (
          <Stack gap="xs">
            {entries.map((entry, index) => (
              <Card
                key={`${entry.organizationName}-${index}`}
                withBorder
                radius="sm"
                padding="sm"
              >
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={4}>
                    <Text size="sm" fw={600}>
                      {entry.organizationName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {entry.natureOfInvolvement}
                    </Text>
                    <Text size="xs">{entry.description}</Text>
                  </Stack>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={() => onRemove(index)}
                  >
                    <Text size="xs">X</Text>
                  </ActionIcon>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>

      <Modal opened={opened} onClose={close} title="Add Competing Commitment">
        <Stack gap="md">
          <TextInput
            label="Organization Name"
            placeholder="e.g. Acme Corp"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
          />
          <TextInput
            label="Nature of Involvement"
            placeholder="e.g. Part-time consultant"
            value={involvement}
            onChange={(e) => setInvolvement(e.target.value)}
            required
          />
          <Textarea
            label="Description"
            placeholder="Describe the nature of this commitment and any potential conflicts..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            minRows={3}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button onClick={handleAdd}>Add</Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
