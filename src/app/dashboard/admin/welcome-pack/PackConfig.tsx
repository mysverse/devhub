"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  ColorInput,
  FileButton,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import IdCardPreview, {
  type IdCardAlign,
  type IdCardWrapMode,
} from "@/app/dashboard/welcome-pack/IdCardPreview";
import { getOrderingWindowState } from "@/lib/welcome-pack-ordering";
import { saveWelcomePackConfig, type WelcomePackConfigInput } from "./actions";

export type PackConfigData = {
  id: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  wave2Open: boolean;
  orderingEnabled: boolean;
  /** ISO strings (serialized across the RSC boundary). */
  ordersOpenAt: string | null;
  ordersCloseAt: string | null;
  defaultDomesticFulfillmentDays: number;
  defaultInternationalFulfillmentDays: number;
  defaultDomesticDeliveryDays: number;
  defaultInternationalDeliveryDays: number;
  defaultParcelWeightKg: number | null;
  defaultParcelLengthCm: number | null;
  defaultParcelWidthCm: number | null;
  defaultParcelHeightCm: number | null;
  defaultParcelCurrency: string | null;
  idCardTemplateBlobUrl: string | null;
  idCardWidth: number | null;
  idCardHeight: number | null;
  idCardNameX: number | null;
  idCardNameY: number | null;
  idCardFontSize: number | null;
  idCardFontColor: string | null;
  idCardFontFamily: string | null;
  idCardNameMaxWidth: number | null;
  idCardNameMaxHeight: number | null;
  idCardNameAlign: IdCardAlign | null;
  idCardNameWrapMode: IdCardWrapMode | null;
};

// Mirror of EASYPARCEL_CURRENCIES — duplicated here so this client component
// doesn't pull the server export module (jszip/libphonenumber) into the bundle.
const EASYPARCEL_CURRENCY_OPTIONS = [
  "AUD",
  "EUR",
  "GBP",
  "IDR",
  "MYR",
  "SGD",
  "THB",
  "TWD",
  "USD",
];

const FONT_FAMILIES = [
  { value: "monospace", label: "Monospace" },
  { value: "sans-serif", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  {
    value: '"Inter", "Helvetica Neue", Arial, sans-serif',
    label: "Inter",
  },
  { value: '"Courier New", monospace', label: "Courier New" },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function PackConfig({ pack }: { pack: PackConfigData }) {
  const router = useRouter();

  const [name, setName] = useState(pack.name);
  const [description, setDescription] = useState(pack.description ?? "");
  const [isActive, setIsActive] = useState(pack.isActive);
  const [wave2Open, setWave2Open] = useState(pack.wave2Open);
  const [orderingEnabled, setOrderingEnabled] = useState(pack.orderingEnabled);
  const [ordersOpenAt, setOrdersOpenAt] = useState<string | null>(
    pack.ordersOpenAt,
  );
  const [ordersCloseAt, setOrdersCloseAt] = useState<string | null>(
    pack.ordersCloseAt,
  );
  const [defaultDomesticFulfillmentDays, setDefaultDomesticFulfillmentDays] =
    useState<number | "">(pack.defaultDomesticFulfillmentDays);
  const [
    defaultInternationalFulfillmentDays,
    setDefaultInternationalFulfillmentDays,
  ] = useState<number | "">(pack.defaultInternationalFulfillmentDays);
  const [defaultDomesticDeliveryDays, setDefaultDomesticDeliveryDays] =
    useState<number | "">(pack.defaultDomesticDeliveryDays);
  const [
    defaultInternationalDeliveryDays,
    setDefaultInternationalDeliveryDays,
  ] = useState<number | "">(pack.defaultInternationalDeliveryDays);
  const [defaultParcelWeightKg, setDefaultParcelWeightKg] = useState<
    number | ""
  >(pack.defaultParcelWeightKg ?? "");
  const [defaultParcelLengthCm, setDefaultParcelLengthCm] = useState<
    number | ""
  >(pack.defaultParcelLengthCm ?? "");
  const [defaultParcelWidthCm, setDefaultParcelWidthCm] = useState<number | "">(
    pack.defaultParcelWidthCm ?? "",
  );
  const [defaultParcelHeightCm, setDefaultParcelHeightCm] = useState<
    number | ""
  >(pack.defaultParcelHeightCm ?? "");
  const [defaultParcelCurrency, setDefaultParcelCurrency] = useState<string>(
    pack.defaultParcelCurrency ?? "",
  );
  const [idCardWidth, setIdCardWidth] = useState<number | "">(
    pack.idCardWidth ?? "",
  );
  const [idCardHeight, setIdCardHeight] = useState<number | "">(
    pack.idCardHeight ?? "",
  );
  const [idCardNameX, setIdCardNameX] = useState<number | "">(
    pack.idCardNameX ?? "",
  );
  const [idCardNameY, setIdCardNameY] = useState<number | "">(
    pack.idCardNameY ?? "",
  );
  const [idCardFontSize, setIdCardFontSize] = useState<number | "">(
    pack.idCardFontSize ?? "",
  );
  const [idCardFontColor, setIdCardFontColor] = useState(
    pack.idCardFontColor ?? "#ffffff",
  );
  const [idCardFontFamily, setIdCardFontFamily] = useState(
    pack.idCardFontFamily ?? "monospace",
  );
  const [templateUrl, setTemplateUrl] = useState(pack.idCardTemplateBlobUrl);

  const [idCardNameMaxWidth, setIdCardNameMaxWidth] = useState<number | "">(
    pack.idCardNameMaxWidth ?? "",
  );
  const [idCardNameMaxHeight, setIdCardNameMaxHeight] = useState<number | "">(
    pack.idCardNameMaxHeight ?? "",
  );
  const [idCardNameAlign, setIdCardNameAlign] = useState<IdCardAlign>(
    pack.idCardNameAlign ?? "left",
  );
  const [idCardNameWrapMode, setIdCardNameWrapMode] = useState<IdCardWrapMode>(
    pack.idCardNameWrapMode ?? "nowrap",
  );

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewName, setPreviewName] = useState("Sample Name");
  const [showBoxOutline, setShowBoxOutline] = useState(true);

  async function handleSave() {
    setSaving(true);
    const input: WelcomePackConfigInput = {
      packId: pack.id ?? undefined,
      name,
      description,
      isActive,
      wave2Open,
      orderingEnabled,
      ordersOpenAt: ordersOpenAt ? new Date(ordersOpenAt).toISOString() : null,
      ordersCloseAt: ordersCloseAt
        ? new Date(ordersCloseAt).toISOString()
        : null,
      defaultDomesticFulfillmentDays:
        defaultDomesticFulfillmentDays === ""
          ? 14
          : Number(defaultDomesticFulfillmentDays),
      defaultInternationalFulfillmentDays:
        defaultInternationalFulfillmentDays === ""
          ? 21
          : Number(defaultInternationalFulfillmentDays),
      defaultDomesticDeliveryDays:
        defaultDomesticDeliveryDays === ""
          ? 3
          : Number(defaultDomesticDeliveryDays),
      defaultInternationalDeliveryDays:
        defaultInternationalDeliveryDays === ""
          ? 14
          : Number(defaultInternationalDeliveryDays),
      defaultParcelWeightKg:
        defaultParcelWeightKg === "" ? null : Number(defaultParcelWeightKg),
      defaultParcelLengthCm:
        defaultParcelLengthCm === "" ? null : Number(defaultParcelLengthCm),
      defaultParcelWidthCm:
        defaultParcelWidthCm === "" ? null : Number(defaultParcelWidthCm),
      defaultParcelHeightCm:
        defaultParcelHeightCm === "" ? null : Number(defaultParcelHeightCm),
      defaultParcelCurrency: defaultParcelCurrency.trim() || null,
      idCardWidth: idCardWidth === "" ? null : Number(idCardWidth),
      idCardHeight: idCardHeight === "" ? null : Number(idCardHeight),
      idCardNameX: idCardNameX === "" ? null : Number(idCardNameX),
      idCardNameY: idCardNameY === "" ? null : Number(idCardNameY),
      idCardFontSize: idCardFontSize === "" ? null : Number(idCardFontSize),
      idCardFontColor,
      idCardFontFamily,
      idCardNameMaxWidth:
        idCardNameMaxWidth === "" ? null : Number(idCardNameMaxWidth),
      idCardNameMaxHeight:
        idCardNameMaxHeight === "" ? null : Number(idCardNameMaxHeight),
      idCardNameAlign,
      idCardNameWrapMode,
    };
    const res = await saveWelcomePackConfig(input);
    setSaving(false);
    if (res?.error) {
      toast.error(res.error);
      return;
    }
    if ("openOrdersWarning" in res && res.openOrdersWarning) {
      toast.warning(
        `Pack deactivated — ${res.openOrdersWarning} open order(s) still need fulfillment. They remain visible in the Orders tab.`,
      );
    } else {
      toast.success("Welcome pack saved");
    }
  }

  async function handleTemplateUpload(file: File | null) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File must be under 10 MB");
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Only JPEG and PNG files are accepted");
      return;
    }
    if (!pack.id) {
      toast.error("Save the pack first before uploading a template");
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.set("kind", "id-card-template");
    formData.set("id", pack.id);
    formData.set("file", file);

    try {
      const res = await fetch("/api/welcome-pack/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to upload template");
        return;
      }
      setTemplateUrl(data.url);
      if (data.width) setIdCardWidth(data.width);
      if (data.height) setIdCardHeight(data.height);
      toast.success("Template uploaded");
      router.refresh();
    } catch {
      toast.error("Failed to upload template");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={4}>Pack details</Title>
              <Text c="dimmed" size="sm">
                Visible name and description shown on the user-facing order
                form.
              </Text>
            </div>
            {pack.id ? (
              <Badge variant="light" color={isActive ? "green" : "gray"}>
                {isActive ? "Active" : "Inactive"}
              </Badge>
            ) : (
              <Badge variant="light" color="blue">
                New
              </Badge>
            )}
          </Group>

          <TextInput
            label="Pack name"
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
            <Switch
              label="Active"
              checked={isActive}
              onChange={(e) => setIsActive(e.currentTarget.checked)}
            />
            <Switch
              label="Wave 2 open"
              description="Lets users without a recent Linear issue order"
              checked={wave2Open}
              onChange={(e) => setWave2Open(e.currentTarget.checked)}
            />
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <div>
            <Title order={4}>Fulfilment defaults</Title>
            <Text c="dimmed" size="sm">
              Used to seed estimated dates when an order is approved. Order
              estimates can still be edited later.
            </Text>
          </div>

          <Group grow align="flex-start">
            <NumberInput
              label="Domestic fulfilment lead"
              description="Days from approval to packing/ship-by"
              value={defaultDomesticFulfillmentDays}
              onChange={(v) =>
                setDefaultDomesticFulfillmentDays(
                  typeof v === "number" ? v : "",
                )
              }
              min={0}
              max={365}
              suffix=" days"
            />
            <NumberInput
              label="Domestic delivery lead"
              description="Days from fulfilment to expected arrival"
              value={defaultDomesticDeliveryDays}
              onChange={(v) =>
                setDefaultDomesticDeliveryDays(typeof v === "number" ? v : "")
              }
              min={0}
              max={365}
              suffix=" days"
            />
          </Group>

          <Group grow align="flex-start">
            <NumberInput
              label="International fulfilment lead"
              description="Days from approval to packing/ship-by"
              value={defaultInternationalFulfillmentDays}
              onChange={(v) =>
                setDefaultInternationalFulfillmentDays(
                  typeof v === "number" ? v : "",
                )
              }
              min={0}
              max={365}
              suffix=" days"
            />
            <NumberInput
              label="International delivery lead"
              description="Days from fulfilment to expected arrival"
              value={defaultInternationalDeliveryDays}
              onChange={(v) =>
                setDefaultInternationalDeliveryDays(
                  typeof v === "number" ? v : "",
                )
              }
              min={0}
              max={365}
              suffix=" days"
            />
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <div>
            <Title order={4}>EasyParcel parcel defaults</Title>
            <Text c="dimmed" size="sm">
              Default parcel weight, dimensions and declared-value currency used
              for the EasyParcel export. Per-order overrides take precedence.
            </Text>
          </div>
          <Group grow align="flex-start">
            <NumberInput
              label="Weight (kg)"
              value={defaultParcelWeightKg}
              onChange={(v) =>
                setDefaultParcelWeightKg(typeof v === "number" ? v : "")
              }
              min={0}
              step={0.1}
              decimalScale={3}
            />
            <NumberInput
              label="Length (cm)"
              value={defaultParcelLengthCm}
              onChange={(v) =>
                setDefaultParcelLengthCm(typeof v === "number" ? v : "")
              }
              min={0}
            />
            <NumberInput
              label="Width (cm)"
              value={defaultParcelWidthCm}
              onChange={(v) =>
                setDefaultParcelWidthCm(typeof v === "number" ? v : "")
              }
              min={0}
            />
            <NumberInput
              label="Height (cm)"
              value={defaultParcelHeightCm}
              onChange={(v) =>
                setDefaultParcelHeightCm(typeof v === "number" ? v : "")
              }
              min={0}
            />
            <Select
              label="Declared currency"
              data={EASYPARCEL_CURRENCY_OPTIONS}
              value={defaultParcelCurrency || null}
              onChange={(v) => setDefaultParcelCurrency(v ?? "")}
              clearable
            />
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={4}>Ordering</Title>
              <Text c="dimmed" size="sm">
                Controls when new orders are accepted. The pack page stays
                visible either way; submissions are blocked server-side.
              </Text>
            </div>
            <OrderingStatusBadge
              orderingEnabled={orderingEnabled}
              ordersOpenAt={ordersOpenAt}
              ordersCloseAt={ordersCloseAt}
            />
          </Group>

          <Switch
            label="Accept orders"
            description="Master switch — turn off to pause ordering immediately, regardless of the schedule below"
            checked={orderingEnabled}
            onChange={(e) => setOrderingEnabled(e.currentTarget.checked)}
          />

          <Group grow align="flex-start">
            <DateTimePicker
              label="Opens at"
              description="Leave empty to open immediately"
              placeholder="No scheduled open"
              value={ordersOpenAt}
              onChange={setOrdersOpenAt}
              clearable
            />
            <DateTimePicker
              label="Closes at"
              description="Leave empty for no automatic close"
              placeholder="No scheduled close"
              value={ordersCloseAt}
              onChange={setOrdersCloseAt}
              clearable
            />
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <div>
            <Title order={4}>ID card preview</Title>
            <Text c="dimmed" size="sm">
              Upload the card background and dial in where the user&apos;s name
              should sit. Coordinates are in template pixels.
            </Text>
          </div>

          {!pack.id && (
            <Alert color="yellow">
              Save the pack first to enable template upload.
            </Alert>
          )}

          <Group align="flex-start" wrap="wrap">
            <Stack gap="xs" style={{ minWidth: 280, flex: 1 }}>
              <FileButton
                onChange={handleTemplateUpload}
                accept="image/jpeg,image/png"
                disabled={!pack.id || uploading}
              >
                {(props) => (
                  <Button
                    {...props}
                    variant="light"
                    loading={uploading}
                    fullWidth
                  >
                    {templateUrl ? "Replace template" : "Upload template"}
                  </Button>
                )}
              </FileButton>

              <Group grow>
                <NumberInput
                  label="Template width (px)"
                  value={idCardWidth}
                  onChange={(v) =>
                    setIdCardWidth(typeof v === "number" ? v : "")
                  }
                  min={1}
                />
                <NumberInput
                  label="Template height (px)"
                  value={idCardHeight}
                  onChange={(v) =>
                    setIdCardHeight(typeof v === "number" ? v : "")
                  }
                  min={1}
                />
              </Group>
              <Group grow>
                <NumberInput
                  label="Name X (px)"
                  value={idCardNameX}
                  onChange={(v) =>
                    setIdCardNameX(typeof v === "number" ? v : "")
                  }
                  min={0}
                />
                <NumberInput
                  label="Name Y (px)"
                  value={idCardNameY}
                  onChange={(v) =>
                    setIdCardNameY(typeof v === "number" ? v : "")
                  }
                  min={0}
                />
              </Group>
              <Group grow>
                <NumberInput
                  label="Font size (px)"
                  value={idCardFontSize}
                  onChange={(v) =>
                    setIdCardFontSize(typeof v === "number" ? v : "")
                  }
                  min={6}
                />
                <ColorInput
                  label="Font color"
                  value={idCardFontColor}
                  onChange={setIdCardFontColor}
                  format="hex"
                />
              </Group>
              <Select
                label="Font family"
                data={FONT_FAMILIES}
                value={idCardFontFamily}
                onChange={(v) => setIdCardFontFamily(v ?? "monospace")}
              />

              <Group grow>
                <NumberInput
                  label="Name box width (px)"
                  description="Optional. Width of the name area for wrapping/shrinking."
                  value={idCardNameMaxWidth}
                  onChange={(v) =>
                    setIdCardNameMaxWidth(typeof v === "number" ? v : "")
                  }
                  min={1}
                  placeholder="Unbounded"
                />
                <NumberInput
                  label="Name box height (px)"
                  description="Optional. Caps how tall wrapped text can grow."
                  value={idCardNameMaxHeight}
                  onChange={(v) =>
                    setIdCardNameMaxHeight(typeof v === "number" ? v : "")
                  }
                  min={1}
                  placeholder="Unbounded"
                />
              </Group>
              <Group grow>
                <Select
                  label="Alignment"
                  data={[
                    { value: "left", label: "Left" },
                    { value: "center", label: "Center" },
                    { value: "right", label: "Right" },
                  ]}
                  value={idCardNameAlign}
                  onChange={(v) =>
                    setIdCardNameAlign((v as IdCardAlign) ?? "left")
                  }
                  allowDeselect={false}
                />
                <Select
                  label="Long names"
                  description="How to handle names that exceed the box."
                  data={[
                    { value: "nowrap", label: "Single line (overflow)" },
                    { value: "truncate", label: "Single line · ellipsis" },
                    { value: "wrap", label: "Wrap to multiple lines" },
                    { value: "shrink", label: "Shrink to fit" },
                  ]}
                  value={idCardNameWrapMode}
                  onChange={(v) =>
                    setIdCardNameWrapMode((v as IdCardWrapMode) ?? "nowrap")
                  }
                  allowDeselect={false}
                />
              </Group>

              <TextInput
                label="Preview name"
                description="Type a sample name to see the overlay"
                value={previewName}
                onChange={(e) => setPreviewName(e.currentTarget.value)}
              />
              <Switch
                label="Show name-box outline in preview"
                checked={showBoxOutline}
                onChange={(e) => setShowBoxOutline(e.currentTarget.checked)}
              />
            </Stack>

            <Stack gap="xs" style={{ flex: 1, minWidth: 280 }}>
              <IdCardPreview
                templateUrl={templateUrl}
                templateWidth={idCardWidth === "" ? null : Number(idCardWidth)}
                templateHeight={
                  idCardHeight === "" ? null : Number(idCardHeight)
                }
                nameX={idCardNameX === "" ? null : Number(idCardNameX)}
                nameY={idCardNameY === "" ? null : Number(idCardNameY)}
                fontSize={idCardFontSize === "" ? null : Number(idCardFontSize)}
                fontColor={idCardFontColor}
                fontFamily={idCardFontFamily}
                nameMaxWidth={
                  idCardNameMaxWidth === "" ? null : Number(idCardNameMaxWidth)
                }
                nameMaxHeight={
                  idCardNameMaxHeight === ""
                    ? null
                    : Number(idCardNameMaxHeight)
                }
                nameAlign={idCardNameAlign}
                nameWrapMode={idCardNameWrapMode}
                showBoxOutline={showBoxOutline}
                name={previewName}
              />
              <Text size="xs" c="dimmed">
                Preview is scaled to fit. Production renders at template
                resolution.
              </Text>
            </Stack>
          </Group>
        </Stack>
      </Card>

      <Group justify="flex-end">
        <Button onClick={handleSave} loading={saving}>
          {pack.id ? "Save changes" : "Create pack"}
        </Button>
      </Group>
    </Stack>
  );
}

function OrderingStatusBadge({
  orderingEnabled,
  ordersOpenAt,
  ordersCloseAt,
}: {
  orderingEnabled: boolean;
  ordersOpenAt: string | null;
  ordersCloseAt: string | null;
}) {
  // Reflects the *unsaved* form values so admins see the effect before
  // committing. Client time is fine here — enforcement is server-side.
  const state = getOrderingWindowState({
    orderingEnabled,
    ordersOpenAt: ordersOpenAt ? new Date(ordersOpenAt) : null,
    ordersCloseAt: ordersCloseAt ? new Date(ordersCloseAt) : null,
  });

  if (state.open) {
    return (
      <Stack gap={2} align="flex-end">
        <Badge variant="light" color="green">
          Ordering open
        </Badge>
        {state.closesAt && (
          <Text size="xs" c="dimmed">
            Closes {dayjs(state.closesAt).format("D MMM YYYY, HH:mm")}
          </Text>
        )}
      </Stack>
    );
  }

  const copy =
    state.reason === "disabled"
      ? "Paused by switch"
      : state.reason === "not-yet-open"
        ? `Opens ${dayjs(state.opensAt).format("D MMM YYYY, HH:mm")}`
        : `Closed ${dayjs(state.closesAt).format("D MMM YYYY, HH:mm")}`;

  return (
    <Stack gap={2} align="flex-end">
      <Badge
        variant="light"
        color={state.reason === "not-yet-open" ? "yellow" : "red"}
      >
        Ordering closed
      </Badge>
      <Text size="xs" c="dimmed">
        {copy}
      </Text>
    </Stack>
  );
}
