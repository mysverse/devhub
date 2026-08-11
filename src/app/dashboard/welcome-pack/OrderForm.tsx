"use client";

import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Progress,
  Stack,
  Stepper,
  StepperStep,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import {
  Check,
  ClipboardCheck,
  IdCard,
  MapPin,
  Package,
  Send,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AnimatedCollapse,
  Shake,
  SPRING,
  StepTransition,
} from "@/components/animations";
import {
  collectFieldErrors,
  type OrderFieldName,
  STEP_FIELDS,
} from "@/lib/welcome-pack-validation";
import { type SubmitOrderInput, submitWelcomePackOrder } from "./actions";
import IdCardStep from "./order-steps/IdCardStep";
import PackContentsStep from "./order-steps/PackContentsStep";
import ReviewStep from "./order-steps/ReviewStep";
import ShippingStep from "./order-steps/ShippingStep";
import SizeChartModal from "./SizeChartModal";
import { draftToFields, useOrderDraft } from "./useOrderDraft";

export const JUST_SUBMITTED_FLAG = "devhub:welcome-pack:just-submitted";

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
  defaultDomesticFulfillmentDays: number;
  defaultInternationalFulfillmentDays: number;
  defaultDomesticDeliveryDays: number;
  defaultInternationalDeliveryDays: number;
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
  /** Courier label / ID document name. */
  legalName: string | null;
  /** Peer-visible name printed on the physical ID card. */
  preferredName: string | null;
  shippingAddress: string | null;
};

const STEP_LABELS = ["Pack contents", "ID card", "Shipping", "Review"];

function relativeTime(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function OrderForm({
  pack,
  defaults,
  wave,
}: {
  pack: OrderFormPack;
  defaults: OrderFormDefaults;
  wave: 1 | 2;
}) {
  const {
    draft,
    setField,
    setSize,
    step,
    setStep,
    restoredAt,
    clearDraft,
    resetDraft,
  } = useOrderDraft(pack, defaults);

  const [submitting, setSubmitting] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [touched, setTouched] = useState<
    Partial<Record<OrderFieldName, boolean>>
  >({});
  const [shakeKey, setShakeKey] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [restoredDismissed, setRestoredDismissed] = useState(false);
  const [sizeChartItem, setSizeChartItem] = useState<{
    name: string;
    url: string | null;
  } | null>(null);

  const sizedItems = pack.items.filter((i) => i.requiresSize);
  const sizedPickedCount = sizedItems.filter((i) =>
    Boolean(draft.selectedSizes[i.id]),
  ).length;
  const fulfillmentDays =
    draft.region === "DOMESTIC"
      ? pack.defaultDomesticFulfillmentDays
      : pack.defaultInternationalFulfillmentDays;
  const deliveryDays =
    draft.region === "DOMESTIC"
      ? pack.defaultDomesticDeliveryDays
      : pack.defaultInternationalDeliveryDays;

  // One schema parse per render; every inline error reads from this map.
  const fieldErrors = collectFieldErrors(draftToFields(draft));

  function errorFor(name: OrderFieldName): string | null {
    return touched[name] ? (fieldErrors[name] ?? null) : null;
  }

  function markStepTouched(target: number) {
    const names = STEP_FIELDS[target];
    if (!names) return;
    setTouched((prev) => {
      const next = { ...prev };
      for (const name of names) next[name] = true;
      return next;
    });
  }

  /** Returns the failure message for a step, or null when it's complete. */
  function validateStep(target: number): string | null {
    if (target === 0) {
      if (sizedItems.length > 0 && sizedPickedCount < sizedItems.length) {
        return "Pick a size for every clothing item";
      }
      return null;
    }
    const names = STEP_FIELDS[target];
    if (!names) return null;
    for (const name of names) {
      const error = fieldErrors[name];
      if (error) return error;
    }
    return null;
  }

  function signalInvalid(target: number, message: string) {
    setStepError(message);
    setShakeKey((k) => k + 1);
    markStepTouched(target);
    if (target === 0) {
      setFlashKey((k) => k + 1);
      document
        .querySelector('[data-unsized-item="true"]')
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const names = STEP_FIELDS[target] ?? [];
    const firstInvalid = names.find((name) => fieldErrors[name]);
    if (firstInvalid) {
      const input = document.querySelector<HTMLElement>(
        `[name="${firstInvalid}"]`,
      );
      input?.focus();
    }
  }

  function goTo(target: number) {
    setDirection(target > step ? 1 : -1);
    setStep(target);
    setStepError(null);
  }

  function nextStep() {
    const error = validateStep(step);
    if (error) {
      signalInvalid(step, error);
      return;
    }
    goTo(Math.min(step + 1, 3));
  }

  function prevStep() {
    goTo(Math.max(step - 1, 0));
  }

  function jumpToStep(target: number) {
    if (target <= step) {
      goTo(target);
      return;
    }
    for (let i = step; i < target; i++) {
      const error = validateStep(i);
      if (error) {
        if (i !== step) goTo(i);
        signalInvalid(i, error);
        return;
      }
    }
    goTo(target);
  }

  async function handleSubmit() {
    setSubmitting(true);
    const input: SubmitOrderInput = {
      idCardName: draft.idCardName,
      region: draft.region,
      recipientName: draft.recipientName,
      phone: draft.phone,
      addressLine1: draft.addressLine1,
      addressLine2: draft.addressLine2.trim() || undefined,
      city: draft.city,
      stateProvince: draft.stateProvince.trim() || undefined,
      postalCode: draft.postalCode,
      country: draft.country,
      notes: draft.notes.trim() || undefined,
      selections: pack.items.map((item) => ({
        itemId: item.id,
        selectedSize: item.requiresSize
          ? draft.selectedSizes[item.id]
          : undefined,
      })),
    };

    const res = await submitWelcomePackOrder(input);

    if (res?.error) {
      setSubmitting(false);
      toast.error(res.error);
      return;
    }
    // Success: the page revalidates and swaps to the status view, where
    // SuccessCelebration picks up this flag. No toast — the celebration is
    // the confirmation.
    try {
      sessionStorage.setItem(JUST_SUBMITTED_FLAG, "1");
    } catch {
      // ignore
    }
    clearDraft();
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="wrap" align="center">
        <Stack gap={2}>
          <Text c="dimmed">
            Complete the four steps to claim your welcome pack.
          </Text>
          <Text size="sm" c="dimmed">
            After approval, fulfilment is usually estimated at {fulfillmentDays}{" "}
            day(s), plus {deliveryDays} day(s) for delivery.
          </Text>
        </Stack>
        <WaveBadge wave={wave} />
      </Group>

      <AnimatedCollapse opened={restoredAt !== null && !restoredDismissed}>
        <Alert
          color="gray"
          variant="light"
          withCloseButton
          onClose={() => setRestoredDismissed(true)}
        >
          <Group gap={6} wrap="wrap">
            <Text size="sm">
              Draft restored from {restoredAt ? relativeTime(restoredAt) : ""}.
            </Text>
            <Anchor
              component="button"
              type="button"
              size="sm"
              onClick={() => {
                resetDraft();
                setRestoredDismissed(true);
                setTouched({});
              }}
            >
              Clear draft
            </Anchor>
          </Group>
        </Alert>
      </AnimatedCollapse>

      <Box>
        <Stepper active={step} onStepClick={jumpToStep} iconSize={36} size="sm">
          <StepperStep
            label={<Box visibleFrom="sm">Pack contents</Box>}
            description={<Box visibleFrom="sm">Sizes and items</Box>}
            icon={<Package size={18} />}
            completedIcon={<Check size={18} strokeWidth={3} />}
          />
          <StepperStep
            label={<Box visibleFrom="sm">ID card</Box>}
            description={<Box visibleFrom="sm">Name and preview</Box>}
            icon={<IdCard size={18} />}
            completedIcon={<Check size={18} strokeWidth={3} />}
          />
          <StepperStep
            label={<Box visibleFrom="sm">Shipping</Box>}
            description={<Box visibleFrom="sm">Address</Box>}
            icon={<MapPin size={18} />}
            completedIcon={<Check size={18} strokeWidth={3} />}
          />
          <StepperStep
            label={<Box visibleFrom="sm">Review</Box>}
            description={<Box visibleFrom="sm">Confirm and submit</Box>}
            icon={<ClipboardCheck size={18} />}
            completedIcon={<Check size={18} strokeWidth={3} />}
          />
        </Stepper>
        <Stack gap={6} mt="xs" hiddenFrom="sm">
          <Text size="sm" fw={600}>
            Step {step + 1} of 4 — {STEP_LABELS[step]}
          </Text>
          <Progress
            value={((step + 1) / 4) * 100}
            size={4}
            radius="xl"
            transitionDuration={300}
          />
        </Stack>
      </Box>

      <StepTransition step={step} direction={direction} minHeight={280}>
        {step === 0 && (
          <PackContentsStep
            pack={pack}
            selectedSizes={draft.selectedSizes}
            onSelectSize={setSize}
            onViewSizeChart={setSizeChartItem}
            sizedPickedCount={sizedPickedCount}
            sizedTotal={sizedItems.length}
            invalidFlashKey={flashKey}
          />
        )}
        {step === 1 && (
          <IdCardStep
            pack={pack}
            idCardName={draft.idCardName}
            onChange={(value) => setField("idCardName", value)}
            error={errorFor("idCardName")}
            onBlur={() => setTouched((prev) => ({ ...prev, idCardName: true }))}
          />
        )}
        {step === 2 && (
          <ShippingStep
            draft={draft}
            setField={setField}
            profileShippingAddress={defaults.shippingAddress}
            errorFor={errorFor}
            onBlur={(name) => setTouched((prev) => ({ ...prev, [name]: true }))}
          />
        )}
        {step === 3 && (
          <ReviewStep pack={pack} draft={draft} onEdit={jumpToStep} />
        )}
      </StepTransition>

      {/* Screen-reader announcement of validation failures; the visual cues
          are the shake/flash. */}
      <VisuallyHidden aria-live="polite">{stepError ?? ""}</VisuallyHidden>

      <Group justify="space-between" mt="md">
        <Button
          variant="default"
          onClick={prevStep}
          disabled={step === 0 || submitting}
        >
          Back
        </Button>
        <Shake trigger={shakeKey}>
          {step < 3 ? (
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
        </Shake>
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
      transition={SPRING.pop}
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
