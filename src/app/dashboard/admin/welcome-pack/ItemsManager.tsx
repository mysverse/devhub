"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Modal,
  NumberInput,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Pencil, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmModal from "@/components/ConfirmModal";
import {
  deleteWelcomePackItem,
  saveWelcomePackItem,
  type WelcomePackItemInput,
} from "./actions";

export type AdminItemData = {
  id: string;
  name: string;
  description: string | null;
  imageBlobUrl: string | null;
  requiresSize: boolean;
  sizeChartBlobUrl: string | null;
  sizeOptions: string[];
  displayOrder: number;
  isActive: boolean;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function ItemsManager({
  packId,
  items,
}: {
  packId: string | null;
  items: AdminItemData[];
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<AdminItemData | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<AdminItemData | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  function startCreate() {
    setEditing(null);
    open();
  }

  function startEdit(item: AdminItemData) {
    setEditing(item);
    open();
  }

  async function handleConfirmDelete() {
    if (!deleteCandidate) return;
    setDeleting(true);
    const res = await deleteWelcomePackItem(deleteCandidate.id);
    setDeleting(false);
    if (res?.error) {
      toast.error(res.error);
      return;
    }
    if (res?.softDeleted) {
      toast.info(res.message ?? "Item disabled");
    } else {
      toast.success("Item deleted");
    }
    setDeleteCandidate(null);
  }

  if (!packId) {
    return (
      <Alert color="yellow">Create the pack first before adding items.</Alert>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={4}>Items</Title>
          <Text c="dimmed" size="sm">
            Curated contents shipped in every welcome pack.
          </Text>
        </div>
        <Button onClick={startCreate}>Add item</Button>
      </Group>

      {items.length === 0 ? (
        <Card withBorder radius="md" p="xl" ta="center">
          <Text c="dimmed">No items yet. Add one to get started.</Text>
        </Card>
      ) : (
        <Stack gap="sm">
          {items.map((item) => (
            <Card key={item.id} withBorder radius="md" p="md">
              <Group align="flex-start" wrap="nowrap">
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 8,
                    overflow: "hidden",
                    flexShrink: 0,
                    backgroundColor: "var(--mantine-color-dark-5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {item.imageBlobUrl ? (
                    <Image
                      src={item.imageBlobUrl}
                      alt={item.name}
                      width={80}
                      height={80}
                      style={{ objectFit: "cover" }}
                      unoptimized
                    />
                  ) : (
                    <Text size="xs" c="dimmed">
                      No image
                    </Text>
                  )}
                </div>
                <Stack gap={4} style={{ flex: 1 }}>
                  <Group gap="xs" wrap="wrap">
                    <Text fw={600}>{item.name}</Text>
                    {!item.isActive && (
                      <Badge size="xs" color="gray" variant="light">
                        Inactive
                      </Badge>
                    )}
                    {item.requiresSize && (
                      <Badge size="xs" color="blue" variant="light">
                        Sized
                      </Badge>
                    )}
                  </Group>
                  {item.description && (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {item.description}
                    </Text>
                  )}
                  {item.requiresSize && (
                    <Text size="xs" c="dimmed">
                      Sizes:{" "}
                      {item.sizeOptions.length > 0
                        ? item.sizeOptions.join(", ")
                        : "—"}
                    </Text>
                  )}
                </Stack>
                <Group gap="xs">
                  <ActionIcon
                    variant="subtle"
                    onClick={() => startEdit(item)}
                    aria-label="Edit"
                  >
                    <Pencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => setDeleteCandidate(item)}
                    aria-label="Delete"
                  >
                    <Trash2 size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <ItemEditorModal
        key={editing?.id ?? "new"}
        opened={opened}
        onClose={close}
        packId={packId}
        item={editing}
        onSaved={close}
      />

      <ConfirmModal
        opened={Boolean(deleteCandidate)}
        onClose={() => setDeleteCandidate(null)}
        onConfirm={handleConfirmDelete}
        title={`Delete "${deleteCandidate?.name ?? ""}"?`}
        description="If this item has never been ordered it'll be removed permanently. If it's already in someone's order it'll be disabled instead so existing orders stay intact."
        hint="Disabled items still appear on past orders but won't show in new ones."
        confirmLabel="Delete item"
        confirmIcon={<Trash2 size={14} />}
        loading={deleting}
      />
    </Stack>
  );
}

function ItemEditorModal({
  opened,
  onClose,
  packId,
  item,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  packId: string;
  item: AdminItemData | null;
  onSaved: () => void;
}) {
  const router = useRouter();

  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [requiresSize, setRequiresSize] = useState(item?.requiresSize ?? false);
  const [sizeOptions, setSizeOptions] = useState<string[]>(
    item?.sizeOptions ?? [],
  );
  const [displayOrder, setDisplayOrder] = useState<number>(
    item?.displayOrder ?? 0,
  );
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [imageUrl, setImageUrl] = useState(item?.imageBlobUrl ?? null);
  const [sizeChartUrl, setSizeChartUrl] = useState(
    item?.sizeChartBlobUrl ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingChart, setUploadingChart] = useState(false);

  async function handleSave() {
    setSaving(true);
    const input: WelcomePackItemInput = {
      itemId: item?.id,
      packId,
      name,
      description,
      requiresSize,
      sizeOptions,
      displayOrder,
      isActive,
    };
    const res = await saveWelcomePackItem(input);
    setSaving(false);
    if (res?.error) {
      toast.error(res.error);
      return;
    }
    toast.success(item ? "Item updated" : "Item created");
    onSaved();
  }

  async function uploadFile(
    kind: "item-image" | "size-chart",
    file: File | null,
  ) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File must be under 10 MB");
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Only JPEG and PNG files are accepted");
      return;
    }
    if (!item?.id) {
      toast.error("Save the item first before uploading images");
      return;
    }
    if (kind === "item-image") setUploadingImage(true);
    else setUploadingChart(true);

    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("id", item.id);
    formData.set("file", file);

    try {
      const res = await fetch("/api/welcome-pack/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Upload failed");
        return;
      }
      if (kind === "item-image") setImageUrl(data.url);
      else setSizeChartUrl(data.url);
      toast.success("Uploaded");
      router.refresh();
    } catch {
      toast.error("Upload failed");
    } finally {
      if (kind === "item-image") setUploadingImage(false);
      else setUploadingChart(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={item ? `Edit ${item.name}` : "New item"}
      size="lg"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Item name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={6}
        />
        <Group>
          <NumberInput
            label="Display order"
            value={displayOrder}
            onChange={(v) => setDisplayOrder(typeof v === "number" ? v : 0)}
            min={0}
          />
          <Switch
            label="Active"
            checked={isActive}
            onChange={(e) => setIsActive(e.currentTarget.checked)}
          />
          <Switch
            label="Requires size"
            checked={requiresSize}
            onChange={(e) => setRequiresSize(e.currentTarget.checked)}
          />
        </Group>

        {requiresSize && (
          <TagsInput
            label="Size options"
            description="Press Enter after each size (e.g. S, M, L, XL)"
            placeholder="Add size"
            value={sizeOptions}
            onChange={setSizeOptions}
          />
        )}

        {!item ? (
          <Alert color="blue">
            Save first to upload an item image and size chart.
          </Alert>
        ) : (
          <Stack gap="sm">
            <Group align="flex-end">
              <div style={{ flex: 1 }}>
                <Text size="sm" fw={500} mb={4}>
                  Item image
                </Text>
                <FileButton
                  onChange={(file) => uploadFile("item-image", file)}
                  accept="image/jpeg,image/png"
                  disabled={uploadingImage}
                >
                  {(props) => (
                    <Button
                      {...props}
                      variant="light"
                      loading={uploadingImage}
                      fullWidth
                    >
                      {imageUrl ? "Replace image" : "Upload image"}
                    </Button>
                  )}
                </FileButton>
              </div>
              {imageUrl && (
                <Image
                  src={imageUrl}
                  alt="Preview"
                  width={64}
                  height={64}
                  style={{ borderRadius: 6, objectFit: "cover" }}
                  unoptimized
                />
              )}
            </Group>

            {requiresSize && (
              <Group align="flex-end">
                <div style={{ flex: 1 }}>
                  <Text size="sm" fw={500} mb={4}>
                    Size chart
                  </Text>
                  <FileButton
                    onChange={(file) => uploadFile("size-chart", file)}
                    accept="image/jpeg,image/png"
                    disabled={uploadingChart}
                  >
                    {(props) => (
                      <Button
                        {...props}
                        variant="light"
                        loading={uploadingChart}
                        fullWidth
                      >
                        {sizeChartUrl
                          ? "Replace size chart"
                          : "Upload size chart"}
                      </Button>
                    )}
                  </FileButton>
                </div>
                {sizeChartUrl && (
                  <Image
                    src={sizeChartUrl}
                    alt="Size chart preview"
                    width={64}
                    height={64}
                    style={{ borderRadius: 6, objectFit: "cover" }}
                    unoptimized
                  />
                )}
              </Group>
            )}
          </Stack>
        )}

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {item ? "Save changes" : "Create item"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
