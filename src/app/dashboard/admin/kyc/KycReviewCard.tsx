"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { toast } from "sonner";
import { approveKyc, rejectKyc } from "./actions";

type KycReviewCardProps = {
  verification: {
    id: string;
    status: string;
    legalName: string;
    documentType: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    rejectionReason: string | null;
    documentsDeleted: boolean;
    userName: string;
    userEmail: string;
  };
};

const REJECTION_REASONS = [
  { value: "ID not legible", label: "ID not legible" },
  { value: "Document expired", label: "Document expired" },
  { value: "Name mismatch", label: "Name mismatch" },
  { value: "Selfie doesn't match ID", label: "Selfie doesn't match ID" },
  { value: "ID not fully visible", label: "ID not fully visible" },
  { value: "Suspected tampering", label: "Suspected tampering" },
];

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  mykad: "MyKad",
  passport: "Passport",
  driving_licence: "Driving Licence",
};

const CHECKLIST = [
  "Document is clear and fully legible",
  "Document is an accepted government-issued ID",
  "Document is not expired",
  "Name on ID matches the submitted legal name",
  "Person in selfie matches the photo on ID",
  "User is holding the physical document in the selfie",
  "No signs of digital editing or tampering",
];

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    PENDING: "yellow",
    APPROVED: "green",
    REJECTED: "red",
    EXPIRED: "orange",
  };
  return (
    <Badge color={colorMap[status] || "gray"} variant="light">
      {status}
    </Badge>
  );
}

export default function KycReviewCard({ verification }: KycReviewCardProps) {
  const [loading, setLoading] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState("");

  const isPending = verification.status === "PENDING";

  async function handleApprove() {
    setLoading(true);
    const res = await approveKyc(verification.id);
    if (res?.error) {
      toast.error(res.error);
    } else {
      toast.success("Verification approved");
    }
    setLoading(false);
  }

  async function handleReject() {
    const reason = rejectionNotes
      ? `${rejectionReason}: ${rejectionNotes}`
      : rejectionReason || "";

    if (!reason) {
      toast.error("Please select a rejection reason");
      return;
    }

    setLoading(true);
    const res = await rejectKyc(verification.id, reason);
    if (res?.error) {
      toast.error(res.error);
    } else {
      toast.success("Verification rejected");
      setShowRejectForm(false);
    }
    setLoading(false);
  }

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Group justify="space-between">
          <div>
            <Group gap="xs">
              <Title order={4}>{verification.userName}</Title>
              <StatusBadge status={verification.status} />
            </Group>
            <Text size="sm" c="dimmed">
              {verification.userEmail}
            </Text>
          </div>
          <Text size="xs" c="dimmed">
            Submitted{" "}
            {new Date(verification.submittedAt).toLocaleDateString("en-MY", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </Group>

        <Group gap="lg">
          <div>
            <Text size="sm" fw={500}>
              Legal Name
            </Text>
            <Text size="sm">{verification.legalName}</Text>
          </div>
          <div>
            <Text size="sm" fw={500}>
              Document Type
            </Text>
            <Text size="sm">
              {verification.documentType
                ? (DOCUMENT_TYPE_LABELS[verification.documentType] ??
                  verification.documentType)
                : "Not specified"}
            </Text>
          </div>
        </Group>

        {/* Document images */}
        {verification.documentsDeleted ? (
          <Alert color="gray" title="Documents deleted">
            Documents have been deleted per retention policy.
          </Alert>
        ) : (
          <Group gap="md" grow>
            <div>
              <Text size="sm" fw={500} mb="xs">
                Government ID
              </Text>
              <Image
                src={`/api/kyc/document/${verification.id}/id-document`}
                alt="Government ID"
                radius="md"
                fit="contain"
                h={240}
                fallbackSrc="data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23333' width='200' height='200'/%3E%3Ctext fill='%23666' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3EFailed to load%3C/text%3E%3C/svg%3E"
              />
            </div>
            <div>
              <Text size="sm" fw={500} mb="xs">
                Selfie with ID
              </Text>
              <Image
                src={`/api/kyc/document/${verification.id}/selfie`}
                alt="Selfie with ID"
                radius="md"
                fit="contain"
                h={240}
                fallbackSrc="data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23333' width='200' height='200'/%3E%3Ctext fill='%23666' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3EFailed to load%3C/text%3E%3C/svg%3E"
              />
            </div>
          </Group>
        )}

        {/* Reviewer checklist */}
        {isPending && (
          <Alert color="blue" title="Verification Checklist">
            <Stack gap={4}>
              {CHECKLIST.map((item) => (
                <Text key={item} size="sm">
                  &bull; {item}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}

        {/* Rejection reason for decided verifications */}
        {verification.rejectionReason && (
          <Alert color="red" title="Rejection Reason">
            {verification.rejectionReason}
          </Alert>
        )}

        {verification.reviewedAt && (
          <Text size="xs" c="dimmed">
            Reviewed{" "}
            {new Date(verification.reviewedAt).toLocaleDateString("en-MY", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        )}

        {/* Action buttons */}
        {isPending && !verification.documentsDeleted && (
          <Group>
            <Button color="green" onClick={handleApprove} loading={loading}>
              Approve
            </Button>
            <Button
              color="red"
              variant="light"
              onClick={() => setShowRejectForm(!showRejectForm)}
              disabled={loading}
            >
              Reject
            </Button>
          </Group>
        )}

        {showRejectForm && (
          <Stack gap="sm">
            <Select
              label="Rejection Reason"
              data={REJECTION_REASONS}
              value={rejectionReason}
              onChange={setRejectionReason}
              placeholder="Select a reason"
              required
            />
            <Textarea
              label="Additional Notes (optional)"
              value={rejectionNotes}
              onChange={(e) => setRejectionNotes(e.currentTarget.value)}
              placeholder="Any additional details..."
              rows={2}
            />
            <Group>
              <Button
                color="red"
                onClick={handleReject}
                loading={loading}
                disabled={!rejectionReason}
              >
                Confirm Rejection
              </Button>
              <Button
                variant="subtle"
                onClick={() => setShowRejectForm(false)}
                disabled={loading}
              >
                Cancel
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
