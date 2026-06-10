"use client";

import {
  Alert,
  Button,
  Card,
  FileInput,
  Group,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import LinkAnchor from "@/components/LinkAnchor";
import { updateAutoPayoutSetting } from "./actions";

type KycStatusProps = {
  kycStatus: string | null;
  kycRejectionReason: string | null;
  legalName: string | null;
  autoPayoutEnabled: boolean;
};

const DOCUMENT_TYPES = [
  { value: "mykad", label: "MyKad" },
  { value: "passport", label: "Passport" },
  { value: "driving_licence", label: "Driving Licence" },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function KycStatus({
  kycStatus,
  kycRejectionReason,
  legalName,
  autoPayoutEnabled,
}: KycStatusProps) {
  const router = useRouter();
  const [_isRefreshing, startRefreshTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingAutoPayout, setTogglingAutoPayout] = useState(false);
  const [autoPayout, setAutoPayout] = useState(autoPayoutEnabled);
  const [localStatus, setLocalStatus] = useState(kycStatus);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [fileErrors, setFileErrors] = useState<{
    id?: string;
    selfie?: string;
  }>({});

  const canSubmitKyc =
    localStatus === null ||
    localStatus === "REJECTED" ||
    localStatus === "EXPIRED";
  const isApproved = localStatus === "APPROVED";
  const isPending = localStatus === "PENDING";

  function validateFile(file: File | null, field: "id" | "selfie"): boolean {
    if (!file) {
      setFileErrors((prev) => ({
        ...prev,
        [field]: "File is required",
      }));
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileErrors((prev) => ({
        ...prev,
        [field]: "File must be under 10 MB",
      }));
      return false;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setFileErrors((prev) => ({
        ...prev,
        [field]: "Only JPEG and PNG files are accepted",
      }));
      return false;
    }
    setFileErrors((prev) => ({ ...prev, [field]: undefined }));
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);

    const legalNameVal = formData.get("legalName") as string;
    const documentType = formData.get("documentType") as string;

    if (!legalNameVal || legalNameVal.trim().length < 2) {
      toast.error("Legal name must be at least 2 characters");
      return;
    }

    if (!documentType) {
      toast.error("Please select a document type");
      return;
    }

    const idValid = validateFile(idFile, "id");
    const selfieValid = validateFile(selfieFile, "selfie");
    if (!idValid || !selfieValid) return;

    setSubmitting(true);

    const uploadData = new FormData();
    uploadData.set("legalName", legalNameVal.trim());
    uploadData.set("documentType", documentType);
    uploadData.set("idDocument", idFile as File);
    uploadData.set("selfie", selfieFile as File);

    try {
      const res = await fetch("/api/kyc/submit", {
        method: "POST",
        body: uploadData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to submit verification");
        return;
      }

      toast.success(
        "Verification submitted! We'll review your documents within 1-2 business days.",
      );
      setLocalStatus("PENDING");
      setShowForm(false);
      startRefreshTransition(() => router.refresh());
    } catch {
      toast.error("Failed to submit verification. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAutoPayoutToggle(checked: boolean) {
    setTogglingAutoPayout(true);
    setAutoPayout(checked);

    const res = await updateAutoPayoutSetting(checked);

    if (res?.error) {
      toast.error(res.error);
      setAutoPayout(!checked); // Revert
    } else {
      toast.success(
        checked ? "Automatic payouts enabled" : "Automatic payouts disabled",
      );
    }

    setTogglingAutoPayout(false);
  }

  return (
    <Card withBorder radius="md" padding="xl" mt="md">
      <Title order={4} mb="md">
        Automatic Payouts
      </Title>

      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div style={{ flex: 1 }}>
            <Text size="sm" fw={500}>
              Enable automatic payouts
            </Text>
            <Text size="xs" c="dimmed">
              {isApproved
                ? "Your eWallet payouts will be processed automatically via Xendit."
                : "Requires identity verification. Your payouts will be processed manually until verification is complete."}
            </Text>
          </div>
          <Switch
            checked={autoPayout}
            onChange={(e) => handleAutoPayoutToggle(e.currentTarget.checked)}
            disabled={!isApproved || togglingAutoPayout}
          />
        </Group>

        {/* Status alerts */}
        {isPending && (
          <Alert color="yellow" title="Verification in progress">
            Your identity verification is under review. This typically takes 1-2
            business days.
          </Alert>
        )}

        {isApproved && (
          <Alert color="green" title="Identity verified">
            Your identity has been verified. You can enable automatic payouts
            above.
          </Alert>
        )}

        {localStatus === "REJECTED" && (
          <Alert color="red" title="Verification not approved">
            {kycRejectionReason || "Your verification was not approved."} You
            can resubmit your documents below.
          </Alert>
        )}

        {localStatus === "EXPIRED" && (
          <Alert color="orange" title="Verification expired">
            Your verification submission has expired. Please resubmit your
            documents.
          </Alert>
        )}

        {/* Start verification / resubmit button */}
        {canSubmitKyc && !showForm && (
          <Button variant="light" onClick={() => setShowForm(true)}>
            {localStatus === null ? "Start Verification" : "Resubmit Documents"}
          </Button>
        )}

        {/* Upload form */}
        {canSubmitKyc && showForm && (
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <Alert color="blue" title="Identity Verification">
                To enable instant payouts, our payment partner requires a
                one-time identity check. We&apos;ll ask for a photo of your
                government ID and a selfie. Your documents are encrypted,
                reviewed by a team member, and deleted within 48 hours of
                verification. We only store whether you passed — not your
                documents.{" "}
                <LinkAnchor href="/policy/aml-kyc">
                  Read our full AML/KYC Policy
                </LinkAnchor>
                .
              </Alert>

              <TextInput
                label="Legal Name (as it appears on your ID)"
                name="legalName"
                defaultValue={legalName || ""}
                placeholder="Full name on your ID"
                required
              />

              <Select
                label="Document Type"
                name="documentType"
                data={DOCUMENT_TYPES}
                placeholder="Select your ID type"
                required
              />

              <FileInput
                label="Government ID Photo"
                description="Clear photo of your MyKad, passport, or driving licence"
                accept="image/jpeg,image/png"
                placeholder="Upload ID photo"
                value={idFile}
                onChange={(file) => {
                  setIdFile(file);
                  if (file) validateFile(file, "id");
                }}
                error={fileErrors.id}
                required
              />

              <FileInput
                label="Selfie with ID"
                description="Photo of yourself holding your ID beside your face"
                accept="image/jpeg,image/png"
                placeholder="Upload selfie"
                value={selfieFile}
                onChange={(file) => {
                  setSelfieFile(file);
                  if (file) validateFile(file, "selfie");
                }}
                error={fileErrors.selfie}
                required
              />

              <Group>
                <Button type="submit" loading={submitting}>
                  Submit Verification
                </Button>
                <Button
                  variant="subtle"
                  onClick={() => setShowForm(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Stack>
    </Card>
  );
}
