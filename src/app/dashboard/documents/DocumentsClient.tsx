"use client";

import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { addCoiEntry, removeCoiEntry, updateCoiEntry } from "./actions";

type CoiEntryData = {
  id: string;
  organizationName: string;
  natureOfInvolvement: string;
  description: string;
};

type DocumentData = {
  type: string;
  title: string;
  signed: boolean;
  signedAt: string | null;
  signedDocumentId: string | null;
  coiEntries: CoiEntryData[];
};

export default function DocumentsClient({
  documents,
}: {
  documents: DocumentData[];
}) {
  return (
    <Stack gap="lg">
      <Title order={2}>Documents</Title>
      <Text c="dimmed">
        View and manage your legal agreements. All documents must be signed
        during onboarding.
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        {documents.map((doc) => (
          <DocumentCard key={doc.type} document={doc} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function DocumentCard({ document }: { document: DocumentData }) {
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>{document.title}</Title>
          <Badge color={document.signed ? "green" : "yellow"} variant="light">
            {document.signed ? "Signed" : "Not Signed"}
          </Badge>
        </Group>

        {document.signed && document.signedAt && (
          <Text size="sm" c="dimmed">
            Signed on{" "}
            {new Date(document.signedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        )}

        <Group gap="sm">
          <Button
            component={Link}
            href={`/dashboard/documents/${document.type.toLowerCase()}`}
            variant={document.signed ? "light" : "filled"}
            size="sm"
          >
            {document.signed ? "View" : "View & Sign"}
          </Button>
          {document.signed && document.signedDocumentId && (
            <Button
              component="a"
              href={`/api/documents/${document.signedDocumentId}/pdf`}
              variant="subtle"
              size="sm"
            >
              Download PDF
            </Button>
          )}
        </Group>

        {document.type === "COI" && document.signed && (
          <CoiEntriesSection entries={document.coiEntries} />
        )}
      </Stack>
    </Card>
  );
}

function CoiEntriesSection({ entries }: { entries: CoiEntryData[] }) {
  const [opened, { open, close }] = useDisclosure(false);
  const [editingEntry, setEditingEntry] = useState<CoiEntryData | null>(null);
  const [loading, setLoading] = useState(false);

  const [orgName, setOrgName] = useState("");
  const [involvement, setInvolvement] = useState("");
  const [description, setDescription] = useState("");

  function resetForm() {
    setOrgName("");
    setInvolvement("");
    setDescription("");
    setEditingEntry(null);
  }

  function openAddModal() {
    resetForm();
    open();
  }

  function openEditModal(entry: CoiEntryData) {
    setEditingEntry(entry);
    setOrgName(entry.organizationName);
    setInvolvement(entry.natureOfInvolvement);
    setDescription(entry.description);
    open();
  }

  async function handleSubmit() {
    if (!orgName.trim() || !involvement.trim() || !description.trim()) {
      toast.error("All fields are required.");
      return;
    }

    setLoading(true);
    const result = editingEntry
      ? await updateCoiEntry({
          entryId: editingEntry.id,
          organizationName: orgName.trim(),
          natureOfInvolvement: involvement.trim(),
          description: description.trim(),
        })
      : await addCoiEntry({
          organizationName: orgName.trim(),
          natureOfInvolvement: involvement.trim(),
          description: description.trim(),
        });

    setLoading(false);

    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success(
        editingEntry ? "Entry updated." : "Entry added.",
      );
      close();
      resetForm();
    }
  }

  async function handleRemove(entryId: string) {
    setLoading(true);
    const result = await removeCoiEntry(entryId);
    setLoading(false);

    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Entry removed.");
    }
  }

  return (
    <Stack gap="xs" mt="sm">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          Competing Commitments
        </Text>
        <Button size="xs" variant="light" onClick={openAddModal}>
          Add Entry
        </Button>
      </Group>

      {entries.length === 0 ? (
        <Text size="sm" c="dimmed">
          No competing commitments declared.
        </Text>
      ) : (
        <Stack gap="xs">
          {entries.map((entry) => (
            <Card key={entry.id} withBorder radius="sm" padding="sm">
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
                <Group gap={4}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => openEditModal(entry)}
                  >
                    <Text size="xs">Edit</Text>
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={() => handleRemove(entry.id)}
                    loading={loading}
                  >
                    <Text size="xs">X</Text>
                  </ActionIcon>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Modal
        opened={opened}
        onClose={close}
        title={editingEntry ? "Edit Entry" : "Add Competing Commitment"}
      >
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
            <Button onClick={handleSubmit} loading={loading}>
              {editingEntry ? "Update" : "Add"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
