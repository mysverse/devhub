"use client";

import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Stepper,
  StepperStep,
  Text,
  Textarea,
  TextInput,
  Title,
  Typography,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  FileSignature,
  Link2,
  PartyPopper,
  Sparkles,
  Timer,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  MODAL_TRANSITION,
  OVERLAY_PROPS,
  SPRING,
  StepTransition,
} from "@/components/animations";
import DuitNowConfirmModal from "@/components/DuitNowConfirmModal";
import DuitNowFields from "@/components/DuitNowFields";
import { oauth2 } from "@/lib/auth-client";
import { siteConfig } from "@/lib/config";
import { formatAmount, getRateMultiplier } from "@/lib/currency";
import {
  type DuitNowFieldName,
  type DuitNowValue,
  duitNowFieldErrors,
  needsDuitNowConfirmation,
} from "@/lib/duitnow-form";
import type {
  IntegrationAvailability,
  SetupIntegrationAvailability,
} from "@/lib/integration-availability";
import {
  DEFAULT_PAYOUT_POLICY,
  type PayoutPolicy,
  WEEKLY_CREDIT_LIMITS,
} from "@/lib/payout-policy";
import { completeOnboarding } from "./actions";

type DocumentTemplate = {
  type: string;
  title: string;
  content: string;
};

type Props = {
  initialName: string | null;
  detectedLinearId: string | null;
  detectedLinearEmail: string | null;
  detectedDiscordId: string | null;
  detectedRobloxId: string | null;
  documentTemplates: DocumentTemplate[];
  integrationAvailability: SetupIntegrationAvailability;
  robuxPayoutAvailability: IntegrationAvailability;
  /** Resolved server-side; drives the earning-model education copy. */
  policy?: PayoutPolicy;
};

export default function OnboardingFlow({
  initialName,
  detectedLinearId,
  detectedLinearEmail,
  detectedDiscordId,
  detectedRobloxId,
  documentTemplates,
  integrationAvailability,
  robuxPayoutAvailability,
  policy = DEFAULT_PAYOUT_POLICY,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 0: user type
  const [userType, setUserType] = useState<"new" | "existing" | null>(null);

  // Step 1: personal info. The OAuth name seeds the DISPLAY name — it is a
  // handle, not a legal name — so the legal-name field starts empty and is
  // only ever filled by the user.
  const [preferredName, setPreferredName] = useState(initialName ?? "");
  const [legalName, setLegalName] = useState("");

  // Step 2: accounts
  const [linearEmail, setLinearEmail] = useState(detectedLinearEmail ?? "");
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);

  // Step 3: agreements
  const [agreedDocuments, setAgreedDocuments] = useState<Set<string>>(
    new Set(),
  );
  const [coiEntries, setCoiEntries] = useState<
    {
      organizationName: string;
      natureOfInvolvement: string;
      description: string;
    }[]
  >([]);

  // Step 4: payment
  const [paymentMethod, setPaymentMethod] = useState<
    "PAYPAL" | "ROBUX" | "DUITNOW" | "BANK_TRANSFER"
  >("PAYPAL");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  // DuitNow details go through the same component and the same rules as HR
  // Settings. This step used to check only that the ID was non-empty, which is
  // why unusable IDs were entered here and only discovered at payout.
  const [duitNow, setDuitNow] = useState<DuitNowValue>({
    mode: "BANK",
    idType: null,
    duitNowId: "",
    bankName: null,
    bankAccountNumber: "",
    bankAccountName: "",
  });
  const [duitNowTouched, setDuitNowTouched] = useState<
    Partial<Record<DuitNowFieldName, boolean>>
  >({});
  const [duitNowConfirmOpen, setDuitNowConfirmOpen] = useState(false);
  const duitNowErrors = duitNowFieldErrors(duitNow);

  const discordAvailability = integrationAvailability.discord;
  const robloxAvailability = integrationAvailability.roblox;
  const robuxPaymentsAvailable = robuxPayoutAvailability.configured;

  async function handleLinkProvider(providerId: "discord" | "roblox") {
    const availability = integrationAvailability[providerId];
    if (!availability.configured) {
      toast.error(
        availability.unavailableDescription ??
          `${availability.label} linking is unavailable.`,
      );
      return;
    }

    setLinkingProvider(providerId);
    // This page only runs once the user already has a session (established
    // by the earlier Linear sign-in) — use the account-linking endpoint, not
    // signIn.oauth2, or Discord/Roblox get created as a brand new user and
    // silently swap the session out from under the onboarding flow.
    const result = await oauth2.link({
      providerId,
      callbackURL: "/onboarding",
      errorCallbackURL: "/onboarding",
    });
    // On success the client navigates away. Otherwise clear the spinner so the
    // onboarding step doesn't sit there looking hung.
    if (result?.error) {
      toast.error(
        result.error.message ??
          `Couldn't start ${availability.label} linking. Please reload and try again.`,
      );
      setLinkingProvider(null);
    }
  }

  function nextStep() {
    if (active === 0 && !userType) {
      toast.error("Please select your situation to continue.");
      return;
    }
    if (active === 1 && !preferredName.trim()) {
      toast.error("Please enter a display name to continue.");
      return;
    }
    if (active === 1 && !legalName.trim()) {
      toast.error("Please enter your legal name to continue.");
      return;
    }
    if (active === 3 && agreedDocuments.size < documentTemplates.length) {
      toast.error("Please agree to all documents to continue.");
      return;
    }
    setActive((a) => Math.min(a + 1, 5));
  }

  function prevStep() {
    setActive((a) => Math.max(a - 1, 0));
  }

  /**
   * `confirmedNow` is passed by the confirmation modal rather than read from
   * state: the modal calls straight back into this, and a setState would not
   * have landed yet.
   */
  async function handleSubmit(confirmedNow = false) {
    if (paymentMethod === "PAYPAL" && !paypalEmail.trim()) {
      toast.error("Please enter your PayPal email.");
      return;
    }
    if (paymentMethod === "ROBUX" && !robuxPaymentsAvailable) {
      toast.error(
        robuxPayoutAvailability.unavailableDescription ??
          "Robux payments are unavailable right now.",
      );
      return;
    }
    if (paymentMethod === "ROBUX" && !detectedRobloxId) {
      toast.error(
        "Please link your Roblox account before selecting Robux payments.",
      );
      return;
    }
    if (paymentMethod === "DUITNOW") {
      // The same rules HR Settings applies. This step previously checked only
      // that the field was non-empty, so an unusable ID was accepted here and
      // discovered at payout.
      const firstError = Object.values(duitNowFieldErrors(duitNow))[0];
      if (firstError) {
        setDuitNowTouched({
          duitNowIdType: true,
          duitNowId: true,
          bankName: true,
          bankAccountNumber: true,
          bankAccountName: true,
        });
        toast.error(firstError);
        return;
      }
      if (
        !confirmedNow &&
        needsDuitNowConfirmation(duitNow, {
          duitNowId: null,
          duitNowIdType: null,
          duitNowIdStatus: "UNCONFIRMED",
        })
      ) {
        setDuitNowConfirmOpen(true);
        return;
      }
    }
    const needsBankDetails = paymentMethod === "BANK_TRANSFER";
    if (
      needsBankDetails &&
      (!bankName.trim() || !bankAccountNumber.trim() || !bankAccountName.trim())
    ) {
      toast.error("Please fill in all bank details.");
      return;
    }

    setLoading(true);

    const result = await completeOnboarding({
      preferredName: preferredName.trim(),
      legalName: legalName.trim(),
      linearId: detectedLinearId,
      linearEmail: linearEmail.trim() || null,
      paymentMethod,
      paypalEmail:
        paymentMethod === "PAYPAL" ? paypalEmail.trim() || null : null,
      duitNowId:
        paymentMethod === "DUITNOW" && duitNow.mode === "ID"
          ? duitNow.duitNowId.trim() || null
          : null,
      // Sent for the first time here. The server has declared duitNowType in
      // its schema since onboarding was written, but this payload never
      // carried it, so the server has always had to infer the branch from
      // which fields happen to be populated.
      duitNowType: paymentMethod === "DUITNOW" ? duitNow.mode : null,
      duitNowIdType:
        paymentMethod === "DUITNOW" && duitNow.mode === "ID"
          ? duitNow.idType
          : null,
      duitNowConfirmed: confirmedNow,
      bankName:
        paymentMethod === "DUITNOW"
          ? duitNow.mode === "BANK"
            ? duitNow.bankName
            : null
          : needsBankDetails
            ? bankName.trim() || null
            : null,
      bankAccountNumber:
        paymentMethod === "DUITNOW"
          ? duitNow.mode === "BANK"
            ? duitNow.bankAccountNumber.trim() || null
            : null
          : needsBankDetails
            ? bankAccountNumber.trim() || null
            : null,
      bankAccountName:
        paymentMethod === "DUITNOW"
          ? duitNow.mode === "BANK"
            ? duitNow.bankAccountName.trim() || null
            : null
          : needsBankDetails
            ? bankAccountName.trim() || null
            : null,
      agreedDocuments: Array.from(agreedDocuments),
      coiEntries: coiEntries.length > 0 ? coiEntries : undefined,
    });

    setLoading(false);

    if (result?.error) {
      toast.error(result.error);
    } else {
      router.push("/dashboard");
    }
  }

  const cardStyle = {
    borderLeft: "2px solid var(--mantine-color-blue-filled)",
  };

  return (
    <Container size="sm" py="xl">
      <div style={{ marginBottom: "2rem", textAlign: "center" }}>
        <Title order={1} mb="xs">
          Welcome to {siteConfig.appName}
        </Title>
        <Text c="dimmed">
          Let&apos;s get your account set up in just a few steps.
        </Text>
      </div>

      <Stepper active={active} mb="xl" size="sm" iconSize={32}>
        <StepperStep
          label="Welcome"
          icon={<Sparkles size={16} />}
          completedIcon={<CheckCircle2 size={16} />}
        />
        <StepperStep
          label="Personal Info"
          icon={<User size={16} />}
          completedIcon={<CheckCircle2 size={16} />}
        />
        <StepperStep
          label="Accounts"
          icon={<Link2 size={16} />}
          completedIcon={<CheckCircle2 size={16} />}
        />
        <StepperStep
          label="Agreements"
          icon={<FileSignature size={16} />}
          completedIcon={<CheckCircle2 size={16} />}
        />
        <StepperStep
          label="How You Earn"
          icon={<CircleDollarSign size={16} />}
          completedIcon={<CheckCircle2 size={16} />}
        />
        <StepperStep
          label="Payment"
          icon={<Wallet size={16} />}
          completedIcon={<CheckCircle2 size={16} />}
        />
      </Stepper>

      <StepTransition step={active}>
        {/* Step 0: Welcome — user type selection */}
        {active === 0 && (
          <Card withBorder radius="md" padding="xl">
            <Title order={3} mb="xs">
              Tell us about yourself
            </Title>
            <Text c="dimmed" mb="xl">
              This helps us tailor your setup experience.
            </Text>
            <Stack gap="md">
              <motion.div whileHover={{ y: -2 }} transition={SPRING.snappy}>
                <UnstyledButton
                  onClick={() => setUserType("new")}
                  w="100%"
                  style={{
                    border: `2px solid ${userType === "new" ? "var(--mantine-color-blue-filled)" : "var(--mantine-color-default-border)"}`,
                    borderRadius: "var(--mantine-radius-md)",
                    padding: "var(--mantine-spacing-md)",
                    background:
                      userType === "new"
                        ? "var(--mantine-color-blue-light)"
                        : "transparent",
                    transition:
                      "border-color 0.18s ease, background-color 0.18s ease",
                  }}
                >
                  <Text fw={600} mb={4}>
                    I&apos;m new to the team
                  </Text>
                  <Text size="sm" c="dimmed">
                    I&apos;ve just joined and need to set up my accounts for the
                    first time.
                  </Text>
                </UnstyledButton>
              </motion.div>

              <motion.div whileHover={{ y: -2 }} transition={SPRING.snappy}>
                <UnstyledButton
                  onClick={() => setUserType("existing")}
                  w="100%"
                  style={{
                    border: `2px solid ${userType === "existing" ? "var(--mantine-color-blue-filled)" : "var(--mantine-color-default-border)"}`,
                    borderRadius: "var(--mantine-radius-md)",
                    padding: "var(--mantine-spacing-md)",
                    background:
                      userType === "existing"
                        ? "var(--mantine-color-blue-light)"
                        : "transparent",
                    transition:
                      "border-color 0.18s ease, background-color 0.18s ease",
                  }}
                >
                  <Text fw={600} mb={4}>
                    I&apos;m already on the team
                  </Text>
                  <Text size="sm" c="dimmed">
                    I&apos;m already in the Roblox group, Discord server, and
                    Linear workspace — I just need a {siteConfig.appName}{" "}
                    account.
                  </Text>
                </UnstyledButton>
              </motion.div>
            </Stack>
          </Card>
        )}

        {/* Step 1: Personal Information */}
        {active === 1 && (
          <Card withBorder radius="md" padding="xl">
            <Title order={3} mb="xs">
              Personal Information
            </Title>
            <Text c="dimmed" mb="xl">
              Your display name is how the team sees you. Your legal name is
              only used for payouts and paperwork.
            </Text>
            <TextInput
              label="Display Name"
              placeholder="Alex"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              required
              mb="md"
              description="How you appear to everyone on DevHub — dashboards, notifications and emails."
            />
            <TextInput
              label="Legal Name"
              placeholder="John Doe"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              required
              description="Your full legal name as it appears on official documents. Only used for payouts, KYC, signed documents and parcel labels — never shown to other developers."
            />
          </Card>
        )}

        {/* Step 2: Account Setup */}
        {active === 2 && (
          <Card withBorder radius="md" padding="xl">
            <Title order={3} mb="xs">
              {userType === "new"
                ? "Set Up Your Accounts"
                : "Link Your Accounts"}
            </Title>
            <Text c="dimmed" mb="xl">
              {userType === "new"
                ? "Provide your account info so we can connect everything once you're onboarded to each platform."
                : "Connect your existing accounts so we can track your work and process payments correctly."}
            </Text>

            <Stack gap="lg">
              {/* Linear */}
              <Box>
                <Text fw={600} mb="xs">
                  Linear Account
                </Text>
                {detectedLinearId ? (
                  <Alert color="green" title="Linear account detected">
                    Automatically linked to{" "}
                    <strong>{detectedLinearEmail}</strong>. No action needed.
                  </Alert>
                ) : (
                  <Stack gap="xs">
                    {userType === "new" ? (
                      <Alert color="blue">
                        An admin will invite you to the Linear workspace once
                        your
                        {siteConfig.appName} account is set up. You can link
                        your Linear account later from HR Settings.
                      </Alert>
                    ) : (
                      <>
                        <Alert color="yellow" title="Linear not auto-detected">
                          We couldn&apos;t automatically find your Linear
                          account. Enter your Linear workspace email to link it.
                        </Alert>
                        <TextInput
                          label="Linear Workspace Email"
                          placeholder="you@company.com"
                          type="email"
                          value={linearEmail}
                          onChange={(e) => setLinearEmail(e.target.value)}
                          description="The email address you use in your Linear workspace."
                        />
                      </>
                    )}
                  </Stack>
                )}
              </Box>

              {/* Discord */}
              <Box>
                <Text fw={600} mb="xs">
                  Discord Account
                </Text>
                {detectedDiscordId ? (
                  <Alert color="green" title="Discord account linked">
                    Your Discord account is connected (ID: {detectedDiscordId}).
                    No action needed.
                  </Alert>
                ) : (
                  <Stack gap="xs">
                    {discordAvailability.configured ? (
                      <Text size="sm" c="dimmed">
                        Link your Discord account so we can identify you in the
                        server.
                      </Text>
                    ) : (
                      <Alert
                        color="yellow"
                        title={discordAvailability.unavailableTitle}
                      >
                        {discordAvailability.unavailableDescription}
                      </Alert>
                    )}
                    <Button
                      variant="light"
                      color="indigo"
                      loading={linkingProvider === "discord"}
                      disabled={!discordAvailability.configured}
                      onClick={() => handleLinkProvider("discord")}
                    >
                      Link Discord
                    </Button>
                  </Stack>
                )}
              </Box>

              {/* Roblox */}
              <Box>
                <Text fw={600} mb="xs">
                  Roblox Account
                </Text>
                {detectedRobloxId ? (
                  <Alert color="green" title="Roblox account linked">
                    Your Roblox account is connected (ID: {detectedRobloxId}).
                    No action needed.
                  </Alert>
                ) : (
                  <Stack gap="xs">
                    {robloxAvailability.configured ? (
                      <Text size="sm" c="dimmed">
                        Link your Roblox account. Required if you want to
                        receive Robux payments.
                      </Text>
                    ) : (
                      <Alert
                        color="yellow"
                        title={robloxAvailability.unavailableTitle}
                      >
                        {robloxAvailability.unavailableDescription}
                      </Alert>
                    )}
                    <Button
                      variant="light"
                      color="red"
                      loading={linkingProvider === "roblox"}
                      disabled={!robloxAvailability.configured}
                      onClick={() => handleLinkProvider("roblox")}
                    >
                      Link Roblox
                    </Button>
                  </Stack>
                )}
              </Box>
            </Stack>
          </Card>
        )}

        {/* Step 3: Agreements */}
        {active === 3 && (
          <Card withBorder radius="md" padding="xl">
            <Title order={3} mb="xs">
              Legal Agreements
            </Title>
            <Text c="dimmed" mb="xl">
              Please review and agree to the following documents to continue.
            </Text>

            <Stack gap="lg">
              {documentTemplates.map((doc) => (
                <Card key={doc.type} withBorder radius="sm" padding="md">
                  <Stack gap="sm">
                    <Title order={5}>{doc.title}</Title>
                    <ScrollArea h={200}>
                      <Typography>
                        <Markdown remarkPlugins={[remarkGfm]}>
                          {doc.content.replace(
                            /\{\{LEGAL_NAME\}\}/g,
                            legalName || "_______________",
                          )}
                        </Markdown>
                      </Typography>
                    </ScrollArea>
                    <Checkbox
                      label={`I, ${legalName || "[Legal Name]"}, have read and agree to this ${doc.title}.`}
                      checked={agreedDocuments.has(doc.type)}
                      onChange={(e) => {
                        const next = new Set(agreedDocuments);
                        if (e.currentTarget.checked) {
                          next.add(doc.type);
                        } else {
                          next.delete(doc.type);
                        }
                        setAgreedDocuments(next);
                      }}
                    />
                    {doc.type === "COI" && agreedDocuments.has("COI") && (
                      <OnboardingCoiEntries
                        entries={coiEntries}
                        onAdd={(entry) =>
                          setCoiEntries((prev) => [...prev, entry])
                        }
                        onRemove={(index) =>
                          setCoiEntries((prev) =>
                            prev.filter((_, i) => i !== index),
                          )
                        }
                      />
                    )}
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Card>
        )}

        {/* Step 4: How You Earn — the earning model in four skimmable cards */}
        {active === 4 && (
          <Card withBorder radius="md" padding="xl">
            <Title order={3} mb="xs">
              How You Earn
            </Title>
            <Text c="dimmed" mb="xl">
              The four things worth knowing before your first task. The full
              guide lives under Help once you&apos;re in.
            </Text>
            <Stack gap="md">
              <Card withBorder radius="md" padding="md" style={cardStyle}>
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <CircleDollarSign
                    size={20}
                    color="var(--mantine-color-blue-4)"
                  />
                  <Stack gap={4}>
                    <Text fw={700} fz="sm">
                      PPTs are paid tasks
                    </Text>
                    <Text fz="sm" c="dimmed">
                      Tasks labeled PPT on the board pay per complexity point:{" "}
                      {formatAmount(getRateMultiplier("MYR"), "MYR")}/point in
                      MYR or {formatAmount(getRateMultiplier("ROBUX"), "ROBUX")}
                      /point in Robux, 1&ndash;5 points per task. Claim one and
                      it&apos;s yours instantly.
                    </Text>
                  </Stack>
                </Group>
              </Card>

              <Card withBorder radius="md" padding="md" style={cardStyle}>
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <FileSignature
                    size={20}
                    color="var(--mantine-color-blue-4)"
                  />
                  <Stack gap={4}>
                    <Text fw={700} fz="sm">
                      Proof unlocks payment
                    </Text>
                    <Text fz="sm" c="dimmed">
                      When a task is Done, post a <strong>#ppt-proof</strong>{" "}
                      comment (what changed, links or screenshots, how it was
                      verified). The task then stays Done for a short stability
                      window &mdash; and payment is created automatically.
                    </Text>
                  </Stack>
                </Group>
              </Card>

              <Card withBorder radius="md" padding="md" style={cardStyle}>
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Timer size={20} color="var(--mantine-color-blue-4)" />
                  <Stack gap={4}>
                    <Text fw={700} fz="sm">
                      Claimed tasks stay active
                    </Text>
                    <Text fz="sm" c="dimmed">
                      So work never gets stuck: {policy.warnHours}h without
                      visible activity brings a reminder, {policy.unassignHours}
                      h returns the task to the board (you can reclaim it).
                      Progress notes reset the timer; blocked tasks can be
                      paused; releasing a task you won&apos;t get to is always
                      fine.
                    </Text>
                  </Stack>
                </Group>
              </Card>

              <Card withBorder radius="md" padding="md" style={cardStyle}>
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <TrendingUp size={20} color="var(--mantine-color-blue-4)" />
                  <Stack gap={4}>
                    <Text fw={700} fz="sm">
                      Limits &amp; extras
                    </Text>
                    <Text fz="sm" c="dimmed">
                      Up to {formatAmount(WEEKLY_CREDIT_LIMITS.MYR, "MYR")} (or{" "}
                      {formatAmount(WEEKLY_CREDIT_LIMITS.ROBUX, "ROBUX")}) per
                      week pays out automatically; anything above waits for an
                      admin and is never lost. On top of PPTs:{" "}
                      <strong>incentives</strong> (automatic weekly rewards) and{" "}
                      <strong>bonuses</strong> (monthly, admin-reviewed, never
                      guaranteed).
                    </Text>
                  </Stack>
                </Group>
              </Card>
            </Stack>
          </Card>
        )}

        {/* Step 5: Payment Method */}
        {active === 5 && (
          <Card withBorder radius="md" padding="xl">
            <Title order={3} mb="xs">
              Payment Preferences
            </Title>
            <Text c="dimmed" mb="xl">
              How would you like to receive your PPT earnings? You can change
              this at any time in HR Settings.
            </Text>

            <Stack gap="lg">
              <Select
                label="Preferred Payment Method"
                value={paymentMethod}
                onChange={(val) => {
                  if (!val) return;
                  if (val === "ROBUX" && !robuxPaymentsAvailable) {
                    toast.error(
                      robuxPayoutAvailability.unavailableDescription ??
                        "Robux payments are unavailable right now.",
                    );
                    return;
                  }
                  setPaymentMethod(val as typeof paymentMethod);
                }}
                data={[
                  { value: "PAYPAL", label: "PayPal" },
                  {
                    value: "ROBUX",
                    label: robuxPaymentsAvailable
                      ? "Robux"
                      : "Robux (unavailable)",
                    disabled: !robuxPaymentsAvailable,
                  },
                  { value: "DUITNOW", label: "DuitNow" },
                  {
                    value: "BANK_TRANSFER",
                    label: "International Bank Transfer",
                  },
                ]}
              />

              <Alert color="blue" variant="light">
                Your payment method sets your dashboard currency and rate: Robux
                pays {formatAmount(getRateMultiplier("ROBUX"), "ROBUX")} per
                point; every other method pays{" "}
                {formatAmount(getRateMultiplier("MYR"), "MYR")} per point in
                MYR. You can change this any time in HR Settings.
              </Alert>

              {!robuxPaymentsAvailable && (
                <Alert
                  color="yellow"
                  title={robuxPayoutAvailability.unavailableTitle}
                >
                  {robuxPayoutAvailability.unavailableDescription}
                </Alert>
              )}

              {paymentMethod === "PAYPAL" && (
                <TextInput
                  label="PayPal Email"
                  type="email"
                  placeholder="paypal@example.com"
                  value={paypalEmail}
                  onChange={(e) => setPaypalEmail(e.target.value)}
                  required
                />
              )}

              {paymentMethod === "ROBUX" &&
                (detectedRobloxId ? (
                  <Alert color="green" title="Roblox account linked">
                    Robux payments will be sent to your linked Roblox account
                    (ID: {detectedRobloxId}).
                  </Alert>
                ) : (
                  <Alert color="yellow" title="Roblox account required">
                    You must link your Roblox account in Step 3 (Accounts)
                    before you can receive Robux payments. Go back and link your
                    account first.
                  </Alert>
                ))}

              {paymentMethod === "DUITNOW" && (
                <DuitNowFields
                  value={duitNow}
                  onChange={(patch) =>
                    setDuitNow((prev) => ({ ...prev, ...patch }))
                  }
                  errors={duitNowErrors}
                  touched={duitNowTouched}
                  onBlur={(field) =>
                    setDuitNowTouched((prev) => ({ ...prev, [field]: true }))
                  }
                />
              )}

              {paymentMethod === "BANK_TRANSFER" && (
                <Stack gap="sm">
                  <TextInput
                    label="Bank Name"
                    placeholder="Chase, Bank of America, etc."
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    required
                  />
                  <TextInput
                    label="Account Number / IBAN"
                    placeholder="Account info"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    required
                  />
                  <TextInput
                    label="Account Holder Name"
                    placeholder={legalName || "John Doe"}
                    value={bankAccountName}
                    onChange={(e) => setBankAccountName(e.target.value)}
                    required
                  />
                </Stack>
              )}
            </Stack>
          </Card>
        )}
      </StepTransition>

      <Group justify="space-between" mt="xl">
        {active > 0 ? (
          <Button
            variant="default"
            onClick={prevStep}
            disabled={loading}
            leftSection={<ArrowLeft size={14} />}
          >
            Back
          </Button>
        ) : (
          <div />
        )}

        {active < 5 ? (
          <Button onClick={nextStep} rightSection={<ArrowRight size={14} />}>
            Next
          </Button>
        ) : (
          <Button
            onClick={() => handleSubmit()}
            loading={loading}
            leftSection={<PartyPopper size={16} />}
            color="blue"
          >
            Complete Setup
          </Button>
        )}
      </Group>

      {duitNow.idType && (
        <DuitNowConfirmModal
          opened={duitNowConfirmOpen}
          onClose={() => setDuitNowConfirmOpen(false)}
          onConfirm={() => {
            setDuitNowConfirmOpen(false);
            void handleSubmit(true);
          }}
          idType={duitNow.idType}
          duitNowId={duitNow.duitNowId}
          legalName={legalName.trim() || null}
          loading={loading}
        />
      )}
    </Container>
  );
}

type CoiDraft = {
  organizationName: string;
  natureOfInvolvement: string;
  description: string;
};

function OnboardingCoiEntries({
  entries,
  onAdd,
  onRemove,
}: {
  entries: CoiDraft[];
  onAdd: (entry: CoiDraft) => void;
  onRemove: (index: number) => void;
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const [orgName, setOrgName] = useState("");
  const [involvement, setInvolvement] = useState("");
  const [description, setDescription] = useState("");

  function resetForm() {
    setOrgName("");
    setInvolvement("");
    setDescription("");
  }

  function handleAdd() {
    if (!orgName.trim() || !involvement.trim() || !description.trim()) {
      toast.error("All fields are required.");
      return;
    }
    onAdd({
      organizationName: orgName.trim(),
      natureOfInvolvement: involvement.trim(),
      description: description.trim(),
    });
    resetForm();
    close();
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          Competing Commitments
        </Text>
        <Button size="xs" variant="light" onClick={open}>
          Add Entry
        </Button>
      </Group>

      <Text size="xs" c="dimmed">
        If you have any competing commitments, add them here. You can also add
        them later from the documents page.
      </Text>

      {entries.length > 0 && (
        <Stack gap="xs">
          {entries.map((entry, index) => (
            <Card
              // biome-ignore lint/suspicious/noArrayIndexKey: entries can share organizationName
              key={`${entry.organizationName}-${index}`}
              withBorder
              radius="sm"
              padding="xs"
            >
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={2}>
                  <Text size="sm" fw={600}>
                    {entry.organizationName}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {entry.natureOfInvolvement}
                  </Text>
                  <Text size="xs">{entry.description}</Text>
                </Stack>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  onClick={() => onRemove(index)}
                >
                  <Text size="xs">X</Text>
                </ActionIcon>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Modal
        opened={opened}
        onClose={close}
        title="Add Competing Commitment"
        transitionProps={MODAL_TRANSITION}
        overlayProps={OVERLAY_PROPS}
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
            <Button onClick={handleAdd}>Add</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
