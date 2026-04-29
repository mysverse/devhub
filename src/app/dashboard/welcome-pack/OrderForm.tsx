"use client";

import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Stepper,
  StepperStep,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import type { ShippingRegion } from "@prisma/client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { type SubmitOrderInput, submitWelcomePackOrder } from "./actions";
import IdCardPreview from "./IdCardPreview";
import SizeChartModal from "./SizeChartModal";

export type OrderFormPack = {
  id: string;
  name: string;
  description: string | null;
  idCardTemplateBlobUrl: string | null;
  idCardWidth: number | null;
  idCardHeight: number | null;
  idCardNameX: number | null;
  idCardNameY: number | null;
  idCardFontSize: number | null;
  idCardFontColor: string | null;
  idCardFontFamily: string | null;
  items: {
    id: string;
    name: string;
    description: string | null;
    imageBlobUrl: string | null;
    requiresSize: boolean;
    sizeChartBlobUrl: string | null;
    sizeOptions: string[];
  }[];
};

export type OrderFormDefaults = {
  legalName: string | null;
  shippingAddress: string | null;
  email: string | null;
};

const COUNTRY_OPTIONS = [
  { value: "MY", label: "Malaysia (MY)" },
  { value: "SG", label: "Singapore (SG)" },
  { value: "ID", label: "Indonesia (ID)" },
  { value: "TH", label: "Thailand (TH)" },
  { value: "PH", label: "Philippines (PH)" },
  { value: "VN", label: "Vietnam (VN)" },
  { value: "BN", label: "Brunei (BN)" },
  { value: "AU", label: "Australia (AU)" },
  { value: "NZ", label: "New Zealand (NZ)" },
  { value: "JP", label: "Japan (JP)" },
  { value: "KR", label: "South Korea (KR)" },
  { value: "GB", label: "United Kingdom (GB)" },
  { value: "US", label: "United States (US)" },
  { value: "CA", label: "Canada (CA)" },
  { value: "DE", label: "Germany (DE)" },
];

export default function OrderForm({
  pack,
  defaults,
  wave,
}: {
  pack: OrderFormPack;
  defaults: OrderFormDefaults;
  wave: 1 | 2;
}) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [region, setRegion] = useState<ShippingRegion>("DOMESTIC");
  const [recipientName, setRecipientName] = useState(defaults.legalName ?? "");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateProvince, setStateProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState<string>("MY");
  const [notes, setNotes] = useState(defaults.shippingAddress ?? "");

  const [idCardName, setIdCardName] = useState(defaults.legalName ?? "");

  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>(
    {},
  );
  const [sizeChartItem, setSizeChartItem] = useState<{
    name: string;
    url: string | null;
  } | null>(null);

  const sizedItems = pack.items.filter((i) => i.requiresSize);
  const allSizesPicked = sizedItems.every((i) => Boolean(selectedSizes[i.id]));

  function validateStep(step: number): string | null {
    if (step === 0) {
      if (sizedItems.length > 0 && !allSizesPicked) {
        return "Pick a size for every clothing item";
      }
    }
    if (step === 1) {
      if (idCardName.trim().length < 2) {
        return "ID card name must be at least 2 characters";
      }
    }
    if (step === 2) {
      if (
        !recipientName.trim() ||
        !phone.trim() ||
        !addressLine1.trim() ||
        !city.trim() ||
        !postalCode.trim() ||
        !country
      ) {
        return "Fill out the required address fields";
      }
      if (region === "DOMESTIC" && country !== "MY") {
        return "Switch to International if shipping outside Malaysia";
      }
    }
    return null;
  }

  function nextStep() {
    const error = validateStep(active);
    if (error) {
      toast.error(error);
      return;
    }
    setActive((s) => Math.min(s + 1, 3));
  }

  function prevStep() {
    setActive((s) => Math.max(s - 1, 0));
  }

  function jumpToStep(target: number) {
    // Always allow going back; for forward jumps, validate every prior step.
    if (target <= active) {
      setActive(target);
      return;
    }
    for (let i = active; i < target; i++) {
      const error = validateStep(i);
      if (error) {
        toast.error(error);
        setActive(i);
        return;
      }
    }
    setActive(target);
  }

  async function handleSubmit() {
    setSubmitting(true);
    const input: SubmitOrderInput = {
      idCardName,
      region,
      recipientName,
      phone,
      addressLine1,
      addressLine2: addressLine2.trim() || undefined,
      city,
      stateProvince: stateProvince.trim() || undefined,
      postalCode,
      country,
      notes: notes.trim() || undefined,
      selections: pack.items.map((item) => ({
        itemId: item.id,
        selectedSize: item.requiresSize ? selectedSizes[item.id] : undefined,
      })),
    };

    const res = await submitWelcomePackOrder(input);
    setSubmitting(false);

    if (res?.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Welcome pack order submitted");
    router.refresh();
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="wrap">
        <div>
          <Title order={2}>{pack.name}</Title>
          {pack.description && (
            <Text c="dimmed" mt={4}>
              {pack.description}
            </Text>
          )}
        </div>
        <Badge variant="light" color={wave === 1 ? "green" : "blue"}>
          Eligible — Wave {wave}
        </Badge>
      </Group>

      <Stepper active={active} onStepClick={jumpToStep}>
        <StepperStep label="Pack contents" description="Sizes and items">
          <Stack gap="md" mt="md">
            <Text c="dimmed">
              These items ship in every welcome pack. Pick a size for each
              clothing item.
            </Text>
            {pack.items.length === 0 && (
              <Alert color="yellow">No items in the pack yet.</Alert>
            )}
            {pack.items.map((item) => (
              <Card key={item.id} withBorder radius="md" p="md">
                <Group align="flex-start" wrap="nowrap">
                  <div
                    style={{
                      width: 96,
                      height: 96,
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
                        width={96}
                        height={96}
                        style={{ objectFit: "cover" }}
                      />
                    ) : (
                      <Text size="xs" c="dimmed">
                        No image
                      </Text>
                    )}
                  </div>
                  <Stack gap={6} style={{ flex: 1 }}>
                    <Text fw={600}>{item.name}</Text>
                    {item.description && (
                      <Text size="sm" c="dimmed">
                        {item.description}
                      </Text>
                    )}
                    {item.requiresSize ? (
                      <Stack gap="xs">
                        <RadioGroup
                          value={selectedSizes[item.id] ?? ""}
                          onChange={(v) =>
                            setSelectedSizes((prev) => ({
                              ...prev,
                              [item.id]: v,
                            }))
                          }
                        >
                          <Group gap="xs">
                            {item.sizeOptions.map((size) => (
                              <Radio key={size} value={size} label={size} />
                            ))}
                          </Group>
                        </RadioGroup>
                        <Anchor
                          component="button"
                          type="button"
                          size="sm"
                          onClick={() =>
                            setSizeChartItem({
                              name: item.name,
                              url: item.sizeChartBlobUrl,
                            })
                          }
                        >
                          View size chart
                        </Anchor>
                      </Stack>
                    ) : (
                      <Badge variant="light" color="gray" w="fit-content">
                        Included
                      </Badge>
                    )}
                  </Stack>
                </Group>
              </Card>
            ))}
          </Stack>
        </StepperStep>

        <StepperStep label="ID card" description="Name and preview">
          <Stack gap="md" mt="md">
            <Text c="dimmed">
              Type the name you&apos;d like printed on your ID card. The preview
              below uses the production card layout.
            </Text>
            <Group align="flex-start" wrap="wrap">
              <Stack gap="md" style={{ flex: 1, minWidth: 280 }}>
                <TextInput
                  label="ID card name"
                  placeholder="As you'd like it printed"
                  value={idCardName}
                  onChange={(e) => setIdCardName(e.currentTarget.value)}
                  required
                />
                <Alert color="blue">
                  Names appear exactly as typed (including capitalisation).
                </Alert>
              </Stack>
              <div style={{ flex: 1, minWidth: 280 }}>
                <IdCardPreview
                  templateUrl={pack.idCardTemplateBlobUrl}
                  templateWidth={pack.idCardWidth}
                  templateHeight={pack.idCardHeight}
                  nameX={pack.idCardNameX}
                  nameY={pack.idCardNameY}
                  fontSize={pack.idCardFontSize}
                  fontColor={pack.idCardFontColor}
                  fontFamily={pack.idCardFontFamily}
                  name={idCardName}
                />
              </div>
            </Group>
          </Stack>
        </StepperStep>

        <StepperStep label="Shipping" description="Address">
          <Stack gap="md" mt="md">
            <RadioGroup
              label="Shipping region"
              value={region}
              onChange={(v) => {
                const next = v as ShippingRegion;
                setRegion(next);
                if (next === "DOMESTIC") setCountry("MY");
              }}
            >
              <Group gap="md">
                <Radio value="DOMESTIC" label="Malaysia (Domestic)" />
                <Radio value="INTERNATIONAL" label="International" />
              </Group>
            </RadioGroup>

            <Group grow>
              <TextInput
                label="Recipient name"
                value={recipientName}
                onChange={(e) => setRecipientName(e.currentTarget.value)}
                required
              />
              <TextInput
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
                required
              />
            </Group>
            <TextInput
              label="Address line 1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.currentTarget.value)}
              required
            />
            <TextInput
              label="Address line 2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.currentTarget.value)}
            />
            <Group grow>
              <TextInput
                label="City"
                value={city}
                onChange={(e) => setCity(e.currentTarget.value)}
                required
              />
              <TextInput
                label="State / Province"
                value={stateProvince}
                onChange={(e) => setStateProvince(e.currentTarget.value)}
              />
            </Group>
            <Group grow>
              <TextInput
                label="Postal code"
                value={postalCode}
                onChange={(e) => setPostalCode(e.currentTarget.value)}
                required
              />
              {region === "DOMESTIC" ? (
                <TextInput label="Country" value="Malaysia" disabled />
              ) : (
                <Select
                  label="Country"
                  data={COUNTRY_OPTIONS.filter((c) => c.value !== "MY")}
                  value={country}
                  onChange={(v) => setCountry(v ?? "")}
                  searchable
                  required
                />
              )}
            </Group>
            <Textarea
              label="Notes (optional)"
              description="Anything we should know — building access, recipient quirks, etc."
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
              autosize
              minRows={2}
              maxRows={5}
            />
          </Stack>
        </StepperStep>

        <StepperStep label="Review" description="Confirm and submit">
          <Stack gap="md" mt="md">
            <Text c="dimmed">
              Last chance to verify everything. After submission, the order is
              locked while admins prepare and ship it.
            </Text>

            <Card withBorder radius="md" p="md">
              <Stack gap="xs">
                <Title order={5}>Pack contents</Title>
                {pack.items.map((item) => (
                  <Group key={item.id} justify="space-between">
                    <Text size="sm">{item.name}</Text>
                    <Text size="sm" c="dimmed">
                      {item.requiresSize
                        ? (selectedSizes[item.id] ?? "—")
                        : "Included"}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Card>

            <Card withBorder radius="md" p="md">
              <Stack gap="xs">
                <Title order={5}>ID card</Title>
                <Text size="sm">{idCardName || "—"}</Text>
              </Stack>
            </Card>

            <Card withBorder radius="md" p="md">
              <Stack gap="xs">
                <Title order={5}>Shipping</Title>
                <Text size="sm">{recipientName}</Text>
                <Text size="sm" c="dimmed">
                  {phone}
                </Text>
                <Text size="sm" style={{ whiteSpace: "pre-line" }}>
                  {[
                    addressLine1,
                    addressLine2,
                    [city, stateProvince].filter(Boolean).join(", "),
                    [postalCode, country].filter(Boolean).join(" "),
                  ]
                    .filter(Boolean)
                    .join("\n")}
                </Text>
                <Badge variant="light" color="cyan" w="fit-content">
                  {region === "DOMESTIC" ? "Domestic — MY" : "International"}
                </Badge>
              </Stack>
            </Card>

            {notes && (
              <Card withBorder radius="md" p="md">
                <Stack gap="xs">
                  <Title order={5}>Notes</Title>
                  <Text size="sm">{notes}</Text>
                </Stack>
              </Card>
            )}
          </Stack>
        </StepperStep>
      </Stepper>

      <Group justify="space-between" mt="md">
        <Button
          variant="default"
          onClick={prevStep}
          disabled={active === 0 || submitting}
        >
          Back
        </Button>
        {active < 3 ? (
          <Button onClick={nextStep}>Next</Button>
        ) : (
          <Button onClick={handleSubmit} loading={submitting}>
            Submit order
          </Button>
        )}
      </Group>

      <SizeChartModal
        opened={Boolean(sizeChartItem)}
        onClose={() => setSizeChartItem(null)}
        itemName={sizeChartItem?.name ?? ""}
        imageUrl={sizeChartItem?.url ?? null}
      />
    </Stack>
  );
}
