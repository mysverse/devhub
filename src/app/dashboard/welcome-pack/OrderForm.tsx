"use client";

import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Chip,
  ChipGroup,
  Flex,
  Group,
  Progress,
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
import {
  Check,
  ClipboardCheck,
  IdCard,
  MapPin,
  Package,
  Ruler,
  Send,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useMemo, useState } from "react";
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
  idCardNameMaxWidth: number | null;
  idCardNameMaxHeight: number | null;
  idCardNameAlign: "left" | "center" | "right" | null;
  idCardNameWrapMode: "nowrap" | "truncate" | "wrap" | "shrink" | null;
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

const STEP_VARIANTS = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
} as const;

const STEP_TRANSITION = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1],
} as const;

export default function OrderForm({
  pack,
  defaults,
  wave,
}: {
  pack: OrderFormPack;
  defaults: OrderFormDefaults;
  wave: 1 | 2;
}) {
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

  const sizedItems = useMemo(
    () => pack.items.filter((i) => i.requiresSize),
    [pack.items],
  );
  const sizedPickedCount = useMemo(
    () => sizedItems.filter((i) => Boolean(selectedSizes[i.id])).length,
    [sizedItems, selectedSizes],
  );
  const allSizesPicked = sizedPickedCount === sizedItems.length;

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
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="wrap" align="flex-start">
        <div>
          <Title order={2}>{pack.name}</Title>
          {pack.description && (
            <Text c="dimmed" mt={4}>
              {pack.description}
            </Text>
          )}
        </div>
        <WaveBadge wave={wave} />
      </Group>

      <Stepper active={active} onStepClick={jumpToStep} iconSize={36} size="sm">
        <StepperStep
          label="Pack contents"
          description="Sizes and items"
          icon={<Package size={18} />}
          completedIcon={<Check size={18} strokeWidth={3} />}
        />
        <StepperStep
          label="ID card"
          description="Name and preview"
          icon={<IdCard size={18} />}
          completedIcon={<Check size={18} strokeWidth={3} />}
        />
        <StepperStep
          label="Shipping"
          description="Address"
          icon={<MapPin size={18} />}
          completedIcon={<Check size={18} strokeWidth={3} />}
        />
        <StepperStep
          label="Review"
          description="Confirm and submit"
          icon={<ClipboardCheck size={18} />}
          completedIcon={<Check size={18} strokeWidth={3} />}
        />
      </Stepper>

      <Box style={{ position: "relative", minHeight: 280 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            variants={STEP_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={STEP_TRANSITION}
            style={{ width: "100%" }}
          >
            {active === 0 && (
              <Stack gap="md">
                <Text c="dimmed">
                  These items ship in every welcome pack. Pick a size for each
                  clothing item.
                </Text>
                {sizedItems.length > 0 && (
                  <ItemsProgress
                    completed={sizedPickedCount}
                    total={sizedItems.length}
                  />
                )}
                {pack.items.length === 0 && (
                  <Alert color="yellow">No items in the pack yet.</Alert>
                )}
                <Stack gap="sm">
                  {pack.items.map((item, idx) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05, duration: 0.35 }}
                    >
                      <PackItemRow
                        item={item}
                        selectedSize={selectedSizes[item.id] ?? ""}
                        onSelectSize={(value) =>
                          setSelectedSizes((prev) => ({
                            ...prev,
                            [item.id]: value,
                          }))
                        }
                        onViewSizeChart={() =>
                          setSizeChartItem({
                            name: item.name,
                            url: item.sizeChartBlobUrl,
                          })
                        }
                      />
                    </motion.div>
                  ))}
                </Stack>
              </Stack>
            )}

            {active === 1 && (
              <Stack gap="md">
                <Text c="dimmed">
                  Type the name you&apos;d like printed on your ID card. The
                  preview below uses the production card layout.
                </Text>
                <Group align="flex-start" wrap="wrap" gap="xl">
                  <Stack gap="md" style={{ flex: 1, minWidth: 260 }}>
                    <TextInput
                      label="ID card name"
                      placeholder="As you'd like it printed"
                      value={idCardName}
                      onChange={(e) => setIdCardName(e.currentTarget.value)}
                      required
                      size="md"
                    />
                    <Alert color="blue" variant="light">
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
                      nameMaxWidth={pack.idCardNameMaxWidth}
                      nameMaxHeight={pack.idCardNameMaxHeight}
                      nameAlign={pack.idCardNameAlign}
                      nameWrapMode={pack.idCardNameWrapMode}
                      name={idCardName}
                      interactive
                    />
                  </div>
                </Group>
              </Stack>
            )}

            {active === 2 && (
              <Stack gap="md">
                <RadioGroup
                  label="Shipping region"
                  value={region}
                  onChange={(v) => {
                    const next = v as ShippingRegion;
                    setRegion(next);
                    if (next === "DOMESTIC") setCountry("MY");
                  }}
                >
                  <Group gap="md" mt={6}>
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
            )}

            {active === 3 && (
              <ReviewStep
                pack={pack}
                selectedSizes={selectedSizes}
                idCardName={idCardName}
                recipientName={recipientName}
                phone={phone}
                addressLine1={addressLine1}
                addressLine2={addressLine2}
                city={city}
                stateProvince={stateProvince}
                postalCode={postalCode}
                country={country}
                region={region}
                notes={notes}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </Box>

      <Group justify="space-between" mt="md">
        <Button
          variant="default"
          onClick={prevStep}
          disabled={active === 0 || submitting}
        >
          Back
        </Button>
        {active < 3 ? (
          <Button onClick={nextStep} rightSection={<Check size={16} />}>
            Next
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            loading={submitting}
            leftSection={<Send size={16} />}
            color="blue"
            size="md"
          >
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

function WaveBadge({ wave }: { wave: 1 | 2 }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 16 }}
    >
      <Badge
        variant="gradient"
        gradient={
          wave === 1
            ? { from: "teal", to: "lime", deg: 45 }
            : { from: "blue", to: "cyan", deg: 45 }
        }
        size="lg"
        leftSection={<Sparkles size={12} />}
      >
        Eligible — Wave {wave}
      </Badge>
    </motion.div>
  );
}

function ItemsProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const done = completed === total;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card withBorder radius="md" p="sm">
        <Stack gap={6}>
          <Group justify="space-between" gap="xs">
            <Group gap={6}>
              <Ruler size={14} />
              <Text size="sm" fw={600}>
                Sizes
              </Text>
            </Group>
            <Group gap="xs">
              <Text
                size="sm"
                c={done ? "teal" : "dimmed"}
                fw={done ? 600 : 400}
              >
                {completed} / {total} picked
              </Text>
              <AnimatePresence>
                {done && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{
                      type: "spring",
                      stiffness: 320,
                      damping: 18,
                    }}
                    style={{ display: "inline-flex" }}
                  >
                    <Check
                      size={14}
                      color="var(--mantine-color-teal-5)"
                      strokeWidth={3}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </Group>
          </Group>
          <Progress
            value={pct}
            size="sm"
            radius="xl"
            color={done ? "teal" : "blue"}
            transitionDuration={400}
          />
        </Stack>
      </Card>
    </motion.div>
  );
}

function PackItemRow({
  item,
  selectedSize,
  onSelectSize,
  onViewSizeChart,
}: {
  item: OrderFormPack["items"][number];
  selectedSize: string;
  onSelectSize: (value: string) => void;
  onViewSizeChart: () => void;
}) {
  const ready = item.requiresSize ? Boolean(selectedSize) : true;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
    >
      <Card
        withBorder
        radius="md"
        p="md"
        style={{
          borderColor: ready
            ? "var(--mantine-color-teal-7)"
            : "var(--mantine-color-dark-5)",
          transition: "border-color 0.25s ease",
        }}
      >
        <Flex
          direction={{ base: "column", sm: "row" }}
          gap="md"
          align={{ base: "stretch", sm: "flex-start" }}
        >
          <Box
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
              alignSelf: "center",
              position: "relative",
            }}
          >
            {item.imageBlobUrl ? (
              <Image
                src={item.imageBlobUrl}
                alt={item.name}
                width={96}
                height={96}
                style={{ objectFit: "cover" }}
                unoptimized
              />
            ) : (
              <Text size="xs" c="dimmed">
                No image
              </Text>
            )}
            <AnimatePresence>
              {ready && item.requiresSize && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{
                    type: "spring",
                    stiffness: 320,
                    damping: 18,
                  }}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    backgroundColor: "var(--mantine-color-teal-6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                  }}
                >
                  <Check size={14} color="white" strokeWidth={3} />
                </motion.div>
              )}
            </AnimatePresence>
          </Box>

          <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
            <Stack gap={2}>
              <Text fw={600}>{item.name}</Text>
              {item.description && (
                <Text size="sm" c="dimmed">
                  {item.description}
                </Text>
              )}
            </Stack>

            {item.requiresSize ? (
              <Stack gap={6}>
                <Group
                  justify="space-between"
                  align="center"
                  wrap="wrap"
                  gap="xs"
                >
                  <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                    Size
                  </Text>
                  <Anchor
                    component="button"
                    type="button"
                    size="sm"
                    onClick={onViewSizeChart}
                  >
                    View size chart
                  </Anchor>
                </Group>
                <ChipGroup
                  value={selectedSize}
                  onChange={(v) => onSelectSize(v as string)}
                >
                  <Group gap={6}>
                    {item.sizeOptions.map((size) => (
                      <Chip key={size} value={size} size="sm" variant="outline">
                        {size}
                      </Chip>
                    ))}
                  </Group>
                </ChipGroup>
              </Stack>
            ) : (
              <Badge variant="light" color="teal" w="fit-content">
                Included
              </Badge>
            )}
          </Stack>
        </Flex>
      </Card>
    </motion.div>
  );
}

function ReviewStep({
  pack,
  selectedSizes,
  idCardName,
  recipientName,
  phone,
  addressLine1,
  addressLine2,
  city,
  stateProvince,
  postalCode,
  country,
  region,
  notes,
}: {
  pack: OrderFormPack;
  selectedSizes: Record<string, string>;
  idCardName: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  region: ShippingRegion;
  notes: string;
}) {
  const cards: { title: string; content: React.ReactNode }[] = [
    {
      title: "Pack contents",
      content: (
        <Stack gap="xs">
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
      ),
    },
    {
      title: "ID card",
      content: <Text size="sm">{idCardName || "—"}</Text>,
    },
    {
      title: "Shipping",
      content: (
        <Stack gap="xs">
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
      ),
    },
  ];
  if (notes) {
    cards.push({ title: "Notes", content: <Text size="sm">{notes}</Text> });
  }

  return (
    <Stack gap="md">
      <Text c="dimmed">
        Last chance to verify everything. After submission, the order is locked
        while admins prepare and ship it.
      </Text>

      {cards.map((card, idx) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.06, duration: 0.35 }}
        >
          <Card withBorder radius="md" p="md">
            <Stack gap="xs">
              <Title order={5}>{card.title}</Title>
              {card.content}
            </Stack>
          </Card>
        </motion.div>
      ))}
    </Stack>
  );
}
