"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Modal,
  Radio,
  RadioGroup,
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
import { useRouter } from "next/navigation";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { signIn } from "@/lib/auth-client";
import { siteConfig } from "@/lib/config";
import {
  DUITNOW_INSTITUTIONS,
  isBillplzSupported,
} from "@/lib/payment-validation";
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
};

export default function OnboardingFlow({
  initialName,
  detectedLinearId,
  detectedLinearEmail,
  detectedDiscordId,
  detectedRobloxId,
  documentTemplates,
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
    if (active === 3 && agreedDocuments.size < documentTemplates.length) {
      toast.error("Please agree to all documents to continue.");
      return;
    }
    setActive((a) => Math.min(a + 1, 4));
  }

  function prevStep() {
    setActive((a) => Math.max(a - 1, 0));
  }

  async function handleSubmit() {
    if (paymentMethod === "PAYPAL" && !paypalEmail.trim()) {
      toast.error("Please enter your PayPal email.");
      return;
    }
    if (paymentMethod === "ROBUX" && !detectedRobloxId) {
      toast.error(
        "Please link your Roblox account before selecting Robux payments.",
      );
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

      <Stepper active={active} mb="xl" size="sm">
        <StepperStep label="Welcome" />
        <StepperStep label="Personal Info" />
        <StepperStep label="Accounts" />
        <StepperStep label="Agreements" />
        <StepperStep label="Payment" />
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
                workspace — I just need a {siteConfig.appName} account.
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
            description="Enter your full legal name as it appears on official documents. This is kept private and only visible to authorised administrators for payment and compliance purposes."
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
                      {siteConfig.appName} account is set up. You can link your
                      Linear account later from HR Settings.
                    </Alert>
                  ) : (
                    <>
                      <Alert color="yellow" title="Linear not auto-detected">
                        We couldn&apos;t automatically find your Linear account.
                        Enter your Linear workspace email to link it.
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
                  <Text size="sm" c="dimmed">
                    Link your Discord account so we can identify you in the
                    server.
                  </Text>
                  <Button
                    variant="light"
                    color="indigo"
                    loading={linkingProvider === "discord"}
                    onClick={() => {
                      setLinkingProvider("discord");
                      signIn.oauth2({
                        providerId: "discord",
                        callbackURL: "/onboarding",
                      });
                    }}
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
                  Your Roblox account is connected (ID: {detectedRobloxId}). No
                  action needed.
                </Alert>
              ) : (
                <Stack gap="xs">
                  <Text size="sm" c="dimmed">
                    Link your Roblox account. Required if you want to receive
                    Robux payments.
                  </Text>
                  <Button
                    variant="light"
                    color="red"
                    loading={linkingProvider === "roblox"}
                    onClick={() => {
                      setLinkingProvider("roblox");
                      signIn.oauth2({
                        providerId: "roblox",
                        callbackURL: "/onboarding",
                      });
                    }}
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

      {/* Step 4: Payment Method */}
      {active === 4 && (
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
                {
                  value: "BANK_TRANSFER",
                  label: "International Bank Transfer",
                },
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

            {paymentMethod === "ROBUX" &&
              (detectedRobloxId ? (
                <Alert color="green" title="Roblox account linked">
                  Robux payments will be sent to your linked Roblox account (ID:{" "}
                  {detectedRobloxId}).
                </Alert>
              ) : (
                <Alert color="yellow" title="Roblox account required">
                  You must link your Roblox account in Step 3 (Accounts) before
                  you can receive Robux payments. Go back and link your account
                  first.
                </Alert>
              ))}

            {paymentMethod === "DUITNOW" && (
              <Stack gap="sm">
                <RadioGroup
                  label="DuitNow Type"
                  value={duitNowType}
                  onChange={(val) => setDuitNowType(val as "ID" | "BANK")}
                >
                  <Group mt="xs">
                    <Radio value="ID" label="Phone / NRIC ID" />
                    <Radio value="BANK" label="Bank Account" />
                  </Group>
                </RadioGroup>

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
                      <Select
                        label="Bank / eWallet"
                        data={DUITNOW_INSTITUTIONS}
                        value={bankName || null}
                        onChange={(val) => setBankName(val || "")}
                        placeholder="Search for your bank or eWallet"
                        searchable
                        required
                        renderOption={({ option }) => (
                          <Group
                            gap="xs"
                            justify="space-between"
                            wrap="nowrap"
                            w="100%"
                          >
                            <Text size="sm">{option.label}</Text>
                            {isBillplzSupported(option.value) && (
                              <Badge
                                size="xs"
                                variant="light"
                                color="teal"
                                style={{ flexShrink: 0 }}
                              >
                                Auto payout
                              </Badge>
                            )}
                          </Group>
                        )}
                      />
                      {bankName && (
                        <Text
                          size="xs"
                          c={isBillplzSupported(bankName) ? "teal" : "dimmed"}
                        >
                          {isBillplzSupported(bankName)
                            ? "Automated payouts supported via Billplz"
                            : "Manual payouts only"}
                        </Text>
                      )}
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

        {active < 4 ? (
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

      <Modal opened={opened} onClose={close} title="Add Competing Commitment">
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
