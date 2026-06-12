"use client";

import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  collectFieldErrors,
  type OrderFieldsInput,
} from "@/lib/welcome-pack-validation";
import type { AddressValues } from "./AddressFields";
import type { OrderFormDefaults, OrderFormPack } from "./OrderForm";

export type OrderDraft = AddressValues & {
  idCardName: string;
  notes: string;
  selectedSizes: Record<string, string>;
};

const DRAFT_VERSION = 1;

type StoredDraft = {
  version: number;
  savedAt: number;
  step: number;
  draft: OrderDraft;
};

function draftKey(packId: string) {
  return `devhub:welcome-pack-draft:v${DRAFT_VERSION}:${packId}`;
}

export function draftToFields(draft: OrderDraft): OrderFieldsInput {
  return {
    idCardName: draft.idCardName,
    region: draft.region,
    recipientName: draft.recipientName,
    phone: draft.phone,
    addressLine1: draft.addressLine1,
    addressLine2: draft.addressLine2 || undefined,
    city: draft.city,
    stateProvince: draft.stateProvince || undefined,
    postalCode: draft.postalCode,
    country: draft.country,
    notes: draft.notes || undefined,
  };
}

function initialDraft(defaults: OrderFormDefaults): OrderDraft {
  return {
    region: "DOMESTIC",
    recipientName: defaults.legalName ?? "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    stateProvince: "",
    postalCode: "",
    country: "MY",
    idCardName: defaults.legalName ?? "",
    notes: "",
    selectedSizes: {},
  };
}

/** Earliest wizard step whose inputs don't validate yet. */
export function firstInvalidStep(
  draft: OrderDraft,
  pack: OrderFormPack,
): number {
  const sized = pack.items.filter((i) => i.requiresSize);
  const sizesOk = sized.every((i) => {
    const size = draft.selectedSizes[i.id];
    return size && i.sizeOptions.includes(size);
  });
  if (!sizesOk) return 0;
  const errors = collectFieldErrors(draftToFields(draft));
  if (errors.idCardName) return 1;
  if (Object.keys(errors).length > 0) return 2;
  return 3;
}

/**
 * Consolidated wizard state with debounced localStorage persistence, so a
 * refresh or accidental navigation doesn't lose a half-completed order.
 * Restores on mount (initial render uses profile defaults — no SSR
 * mismatch), sanitizing stored sizes against the current pack and clamping
 * the restored step to the first invalid one.
 */
export function useOrderDraft(
  pack: OrderFormPack,
  defaults: OrderFormDefaults,
) {
  const [draft, setDraft] = useState<OrderDraft>(() => initialDraft(defaults));
  const [step, setStep] = useState(0);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const dirtyRef = useRef(false);
  const restoredRef = useRef(false);

  const key = draftKey(pack.id);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredDraft;
      if (stored.version !== DRAFT_VERSION || !stored.draft) return;

      // Drop sizes for items/options no longer in the pack.
      const validSizes: Record<string, string> = {};
      for (const item of pack.items) {
        const size = stored.draft.selectedSizes?.[item.id];
        if (size && item.sizeOptions.includes(size)) {
          validSizes[item.id] = size;
        }
      }
      const restored: OrderDraft = {
        ...initialDraft(defaults),
        ...stored.draft,
        selectedSizes: validSizes,
      };
      setDraft(restored);
      setStep(Math.min(stored.step ?? 0, firstInvalidStep(restored, pack)));
      setRestoredAt(stored.savedAt ?? Date.now());
    } catch {
      // Corrupt draft — start clean.
      localStorage.removeItem(key);
    }
  }, [key, pack, defaults]);

  const persist = useDebouncedCallback((next: OrderDraft, nextStep: number) => {
    if (!dirtyRef.current) return;
    try {
      const stored: StoredDraft = {
        version: DRAFT_VERSION,
        savedAt: Date.now(),
        step: nextStep,
        draft: next,
      };
      localStorage.setItem(key, JSON.stringify(stored));
    } catch {
      // Storage full/blocked — drafts are best-effort.
    }
  }, 400);

  useEffect(() => {
    persist(draft, step);
  }, [draft, step, persist]);

  const setField = useCallback(
    <K extends keyof OrderDraft>(field: K, value: OrderDraft[K]) => {
      dirtyRef.current = true;
      setDraft((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const setSize = useCallback((itemId: string, size: string) => {
    dirtyRef.current = true;
    setDraft((prev) => ({
      ...prev,
      selectedSizes: { ...prev.selectedSizes, [itemId]: size },
    }));
  }, []);

  const clearDraft = useCallback(() => {
    dirtyRef.current = false;
    setRestoredAt(null);
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key]);

  const resetDraft = useCallback(() => {
    clearDraft();
    setDraft(initialDraft(defaults));
    setStep(0);
  }, [clearDraft, defaults]);

  return {
    draft,
    setField,
    setSize,
    step,
    setStep,
    restoredAt,
    clearDraft,
    resetDraft,
  };
}
