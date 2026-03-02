"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  Container,
  Group,
  Radio,
  Select,
  Stack,
  Stepper,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { completeOnboarding } from "./actions";

type Props = {
  initialName: string | null;
  detectedLinearId: string | null;
  detectedLinearEmail: string | null;
};

export default function OnboardingFlow({
  initialName,
  detectedLinearId,
  detectedLinearEmail,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 0: user type
  const [userType, setUserType] = useState<"new" | "existing" | null>(null);

  // Step 1: personal info
  const [legalName, setLegalName] = useState(initialName ?? "");

  // Step 2: accounts
  const [linearEmail, setLinearEmail] = useState(detectedLinearEmail ?? "");
  const [discordId, setDiscordId] = useState("");
  const [robuxUsername, setRobuxUsername] = useState("");

  // Step 3: payment
  const [paymentMethod, setPaymentMethod] = useState<
    "PAYPAL" | "ROBUX" | "DUITNOW" | "BANK_TRANSFER"
  >("PAYPAL");
  const [duitNowType, setDuitNowType] = useState<"ID" | "BANK">("ID");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [duitNowId, setDuitNowId] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");

  function nextStep() {
    if (active === 0 && !userType) {
      toast.error("Please select your situation to continue.");
      return;
    }
    if (active === 1 && !legalName.trim()) {
      toast.error("Please enter your legal name to continue.");
      return;
    }
    setActive((a) => Math.min(a + 1, 3));
  }

  function prevStep() {
    setActive((a) => Math.max(a - 1, 0));
  }

  async function handleSubmit() {
    if (paymentMethod === "PAYPAL" && !paypalEmail.trim()) {
      toast.error("Please enter your PayPal email.");
      return;
    }
    if (paymentMethod === "ROBUX" && !robuxUsername.trim()) {
      toast.error("Please enter your Roblox username.");
      return;
    }
    if (
      paymentMethod === "DUITNOW" &&
      duitNowType === "ID" &&
      !duitNowId.trim()
    ) {
      toast.error("Please enter your DuitNow ID.");
      return;
    }
    const needsBankDetails =
      paymentMethod === "BANK_TRANSFER" ||
      (paymentMethod === "DUITNOW" && duitNowType === "BANK");
    if (
      needsBankDetails &&
      (!bankName.trim() || !bankAccountNumber.trim() || !bankAccountName.trim())
    ) {
      toast.error("Please fill in all bank details.");
      return;
    }

    setLoading(true);

    const result = await completeOnboarding({
      legalName: legalName.trim(),
      linearId: detectedLinearId,
      linearEmail: linearEmail.trim() || null,
      discordId: discordId.trim() || null,
      robuxUsername: robuxUsername.trim() || null,
      paymentMethod,
      paypalEmail:
        paymentMethod === "PAYPAL" ? paypalEmail.trim() || null : null,
      duitNowId:
        paymentMethod === "DUITNOW" && duitNowType === "ID"
          ? duitNowId.trim() || null
          : null,
      bankName: needsBankDetails ? bankName.trim() || null : null,
      bankAccountNumber: needsBankDetails
        ? bankAccountNumber.trim() || null
        : null,
      bankAccountName: needsBankDetails ? bankAccountName.trim() || null : null,
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
          Welcome to DevHub
        </Title>
        <Text c="dimmed">
          Let&apos;s get your account set up in just a few steps.
        </Text>
      </div>

      <Stepper active={active} mb="xl" size="sm">
        <Stepper.Step label="Welcome" />
        <Stepper.Step label="Personal Info" />
        <Stepper.Step label="Accounts" />
        <Stepper.Step label="Payment" />
      </Stepper>

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
            <UnstyledButton
              onClick={() => setUserType("new")}
              style={{
                border: `2px solid ${userType === "new" ? "var(--mantine-color-blue-filled)" : "var(--mantine-color-default-border)"}`,
                borderRadius: "var(--mantine-radius-md)",
                padding: "var(--mantine-spacing-md)",
                background:
                  userType === "new"
                    ? "var(--mantine-color-blue-light)"
                    : "transparent",
                transition: "all 0.15s ease",
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

            <UnstyledButton
              onClick={() => setUserType("existing")}
              style={{
                border: `2px solid ${userType === "existing" ? "var(--mantine-color-blue-filled)" : "var(--mantine-color-default-border)"}`,
                borderRadius: "var(--mantine-radius-md)",
                padding: "var(--mantine-spacing-md)",
                background:
                  userType === "existing"
                    ? "var(--mantine-color-blue-light)"
                    : "transparent",
                transition: "all 0.15s ease",
              }}
            >
              <Text fw={600} mb={4}>
                I&apos;m already on the team
              </Text>
              <Text size="sm" c="dimmed">
                I&apos;m already in the Roblox group, Discord server, and Linear
                workspace — I just need a DevHub account.
              </Text>
            </UnstyledButton>
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
            Your legal name is required for payment processing and HR records.
          </Text>
          <TextInput
            label="Legal Name"
            placeholder="John Doe"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            required
            description="Enter your full legal name as it appears on official documents."
          />
        </Card>
      )}

      {/* Step 2: Account Setup */}
      {active === 2 && (
        <Card withBorder radius="md" padding="xl">
          <Title order={3} mb="xs">
            {userType === "new" ? "Set Up Your Accounts" : "Link Your Accounts"}
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
                  Automatically linked to <strong>{detectedLinearEmail}</strong>
                  . No action needed.
                </Alert>
              ) : (
                <Stack gap="xs">
                  {userType === "new" ? (
                    <Alert color="blue">
                      An admin will invite you to the Linear workspace once your
                      DevHub account is set up. You can link your Linear account
                      later from HR Settings.
                    </Alert>
                  ) : (
                    <Alert color="yellow" title="Linear not auto-detected">
                      We couldn&apos;t automatically find your Linear account.
                      Enter your Linear workspace email to link it.
                    </Alert>
                  )}
                  <TextInput
                    label="Linear Workspace Email"
                    placeholder="you@company.com"
                    type="email"
                    value={linearEmail}
                    onChange={(e) => setLinearEmail(e.target.value)}
                    description="The email address you use in your Linear workspace."
                  />
                </Stack>
              )}
            </Box>

            {/* Discord */}
            <TextInput
              label={`Discord User ID${userType === "new" ? " (optional)" : ""}`}
              placeholder="123456789012345678"
              value={discordId}
              onChange={(e) => setDiscordId(e.target.value)}
              description="To find your ID: open Discord Settings → Advanced → enable Developer Mode, then right-click your username and choose Copy User ID."
            />

            {/* Roblox */}
            <TextInput
              label={`Roblox Username${userType === "new" ? " (optional)" : ""}`}
              placeholder="Builderman"
              value={robuxUsername}
              onChange={(e) => setRobuxUsername(e.target.value)}
              description="Your Roblox display name. Required if you want to receive Robux payments."
            />
          </Stack>
        </Card>
      )}

      {/* Step 3: Payment Method */}
      {active === 3 && (
        <Card withBorder radius="md" padding="xl">
          <Title order={3} mb="xs">
            Payment Preferences
          </Title>
          <Text c="dimmed" mb="xl">
            How would you like to receive your PPT earnings? You can change this
            at any time in HR Settings.
          </Text>

          <Stack gap="lg">
            <Select
              label="Preferred Payment Method"
              value={paymentMethod}
              onChange={(val) => setPaymentMethod(val as typeof paymentMethod)}
              data={[
                { value: "PAYPAL", label: "PayPal" },
                { value: "ROBUX", label: "Robux" },
                { value: "DUITNOW", label: "DuitNow" },
                { value: "BANK_TRANSFER", label: "Bank Transfer" },
              ]}
            />

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

            {paymentMethod === "ROBUX" && (
              <TextInput
                label="Roblox Username"
                placeholder="Builderman"
                value={robuxUsername}
                onChange={(e) => setRobuxUsername(e.target.value)}
                required
                description="We'll send Robux directly to this account."
              />
            )}

            {paymentMethod === "DUITNOW" && (
              <Stack gap="sm">
                <Radio.Group
                  label="DuitNow Type"
                  value={duitNowType}
                  onChange={(val) => setDuitNowType(val as "ID" | "BANK")}
                >
                  <Group mt="xs">
                    <Radio value="ID" label="Phone / NRIC ID" />
                    <Radio value="BANK" label="Bank Account" />
                  </Group>
                </Radio.Group>

                {duitNowType === "ID" ? (
                  <TextInput
                    label="DuitNow ID (Phone / NRIC)"
                    placeholder="Enter DuitNow ID"
                    value={duitNowId}
                    onChange={(e) => setDuitNowId(e.target.value)}
                    required
                  />
                ) : (
                  <Box pl="md" style={cardStyle}>
                    <Stack gap="sm">
                      <TextInput
                        label="Bank Name"
                        placeholder="Maybank, CIMB, etc."
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        required
                      />
                      <TextInput
                        label="Account Number"
                        placeholder="1234567890"
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
                  </Box>
                )}
              </Stack>
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

      <Group justify="space-between" mt="xl">
        {active > 0 ? (
          <Button variant="default" onClick={prevStep} disabled={loading}>
            Back
          </Button>
        ) : (
          <div />
        )}

        {active < 3 ? (
          <Button onClick={nextStep}>Next</Button>
        ) : (
          <Button onClick={handleSubmit} loading={loading}>
            Complete Setup
          </Button>
        )}
      </Group>
    </Container>
  );
}
