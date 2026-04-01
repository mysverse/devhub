"use client";

import {
  Badge,
  Button,
  Card,
  Code,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { createBillplzCollection } from "./actions";

export default function BillplzCollectionCard({
  currentCollectionId,
  source,
  callbackUrl,
}: {
  currentCollectionId: string | null;
  source: "redis" | "env" | "none";
  callbackUrl: string;
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const [title, setTitle] = useState("DevHub Payouts");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setLoading(true);
    const res = await createBillplzCollection(title);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      toast.success(`Collection created: ${res.collection.id}`);
      close();
    }
    setLoading(false);
  }

  return (
    <>
      <Card withBorder radius="md" padding="md">
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Billplz Collection
          </Text>
          {currentCollectionId ? (
            <Group gap="xs">
              <Code>{currentCollectionId}</Code>
              <Badge
                size="xs"
                variant="light"
                color={source === "redis" ? "green" : "yellow"}
              >
                {source === "redis" ? "Redis" : "Env var"}
              </Badge>
            </Group>
          ) : (
            <Text size="sm" c="red">
              No collection ID configured
            </Text>
          )}
          <Button size="xs" variant="light" onClick={open}>
            Create New Collection
          </Button>
        </Stack>
      </Card>

      <Modal
        opened={opened}
        onClose={close}
        title="Create Billplz Collection"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Collection Title"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <TextInput
            label="Callback URL"
            value={callbackUrl}
            readOnly
            styles={{
              input: {
                fontFamily: "monospace",
                fontSize: "var(--mantine-font-size-xs)",
              },
            }}
          />
          <Text size="xs" c="dimmed">
            The new collection ID will be saved to Redis and used for all future
            payment orders.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              loading={loading}
              disabled={!title.trim()}
            >
              Create Collection
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
