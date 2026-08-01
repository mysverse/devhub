"use client";

import {
  Badge,
  Box,
  Grid,
  GridCol,
  Group,
  RingProgress,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { Sparkles, TrendingUp, Wallet } from "lucide-react";
import { motion } from "motion/react";
import {
  AnimatedNumber,
  FadeIn,
  MotionCard,
  StaggerContainer,
  StaggerItem,
} from "@/components/animations";
import InfoTip from "@/components/InfoTip";
import LinkAnchor from "@/components/LinkAnchor";
import type { CurrencyCode } from "@/lib/currency";
import { formatAmount } from "@/lib/currency";
import type { PayoutPolicy } from "@/lib/payout-policy";
import HelpDrawer from "./HelpDrawer";

type Props = {
  firstName: string;
  currency: CurrencyCode;
  /** PENDING PPT transactions — payment created, not yet sent. */
  pendingTransactionsAmount: number;
  /** Estimated value of active (not yet completed) claimed tasks. */
  estimatedActiveAmount: number;
  activeTaskCount: number;
  totalEarned: number;
  approvedBonusBalance: number;
  weeklyUsed: number;
  weeklyLimit: number;
  weeklyResetLabel: string;
  paymentMethodLabel: string;
  paymentMethodDetail: string;
  paymentMethodCurrency: CurrencyCode;
  isPaymentMethodSet: boolean;
  todayLabel: string;
  policy: PayoutPolicy;
};

function AnimatedAmount({
  value,
  currency,
  size = "lg",
}: {
  value: number;
  currency: CurrencyCode;
  size?: "lg" | "hero";
}) {
  const numberFormat = {
    minimumFractionDigits: currency === "MYR" ? 2 : 0,
    maximumFractionDigits: currency === "MYR" ? 2 : 0,
  };

  if (size === "hero") {
    return (
      <Group gap="xs" align="baseline" wrap="wrap">
        {currency === "MYR" && (
          <Text fz="xl" fw={600} c="dimmed">
            RM
          </Text>
        )}
        <Text
          fz={{ base: 48, sm: 64, md: 80 }}
          fw={800}
          lh={1}
          style={{ letterSpacing: 0 }}
        >
          <AnimatedNumber value={value} format={numberFormat} />
        </Text>
        {currency === "ROBUX" && (
          <Text fz="xl" fw={600} c="dimmed">
            Robux
          </Text>
        )}
      </Group>
    );
  }

  return (
    <Group gap={4} align="baseline" wrap="nowrap">
      {currency === "MYR" && (
        <Text fz="sm" fw={700} c="gray.4">
          RM
        </Text>
      )}
      <Text fz={size} fw={700}>
        <AnimatedNumber value={value} format={numberFormat} />
      </Text>
      {currency === "ROBUX" && (
        <Text fz="xs" fw={700} c="gray.4">
          Robux
        </Text>
      )}
    </Group>
  );
}

export default function HeroPrimary({
  firstName,
  currency,
  pendingTransactionsAmount,
  estimatedActiveAmount,
  activeTaskCount,
  totalEarned,
  approvedBonusBalance,
  weeklyUsed,
  weeklyLimit,
  weeklyResetLabel,
  paymentMethodLabel,
  paymentMethodDetail,
  paymentMethodCurrency,
  isPaymentMethodSet,
  todayLabel,
  policy,
}: Props) {
  const pendingAmount = pendingTransactionsAmount + estimatedActiveAmount;
  const usagePct = weeklyLimit > 0 ? (weeklyUsed / weeklyLimit) * 100 : 0;
  const progressColor =
    usagePct >= 100 ? "red" : usagePct >= 70 ? "yellow" : "green";

  return (
    <FadeIn>
      <MotionCard
        hoverLift={false}
        withBorder
        radius="lg"
        p={{ base: 20, sm: 32 }}
        style={{
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(135deg, var(--mantine-color-dark-7) 0%, var(--mantine-color-dark-6) 50%, color-mix(in srgb, var(--mantine-color-blue-9) 22%, var(--mantine-color-dark-6)) 100%)",
          border:
            "1px solid color-mix(in srgb, var(--mantine-color-blue-7) 25%, var(--mantine-color-default-border))",
        }}
      >
        <Box
          visibleFrom="sm"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <motion.div
            animate={{
              x: [0, 14, 0],
              y: [0, -10, 0],
              opacity: [0.16, 0.24, 0.16],
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute",
              top: -120,
              right: -180,
              width: 560,
              height: 420,
              background:
                "linear-gradient(135deg, transparent 0%, color-mix(in srgb, var(--mantine-color-blue-5) 28%, transparent) 46%, transparent 76%)",
              filter: "blur(36px)",
              transform: "rotate(-18deg)",
            }}
          />
        </Box>

        <Grid
          gap={{ base: "md", md: 40 }}
          align="center"
          style={{ position: "relative", zIndex: 1 }}
        >
          <GridCol span={{ base: 12, md: 7 }}>
            <StaggerContainer staggerChildren={0.06} delayChildren={0.05}>
              <Stack gap="md">
                <StaggerItem>
                  <Stack gap={4}>
                    <Text fz="sm" tt="uppercase" fw={700} c="blue.3">
                      Hi, {firstName}
                    </Text>
                    <Group gap={4} wrap="nowrap">
                      <Text fz="sm" c="dimmed">
                        Projected earnings &middot; {todayLabel}
                      </Text>
                      <InfoTip label="Payments already created but not yet sent, plus the estimated value of tasks you've claimed but not finished. Not money in your account yet." />
                    </Group>
                  </Stack>
                </StaggerItem>
                <StaggerItem>
                  <AnimatedAmount
                    value={pendingAmount}
                    currency={currency}
                    size="hero"
                  />
                </StaggerItem>
                <StaggerItem>
                  {activeTaskCount === 0 ? (
                    <Text fz="md" c="gray.4">
                      Ready when you are &mdash; pick up a PPT to start earning.
                    </Text>
                  ) : (
                    <Text fz="md" c="gray.4">
                      <Text component="span" fw={600} c="gray.1">
                        {formatAmount(pendingTransactionsAmount, currency)}
                      </Text>{" "}
                      awaiting payout &middot;{" "}
                      <Text component="span" fw={600} c="gray.1">
                        {formatAmount(estimatedActiveAmount, currency)}
                      </Text>{" "}
                      estimated from {activeTaskCount} active task
                      {activeTaskCount === 1 ? "" : "s"}
                    </Text>
                  )}
                </StaggerItem>
                <StaggerItem>
                  <HelpDrawer
                    currency={currency}
                    weeklyLimit={weeklyLimit}
                    policy={policy}
                  />
                </StaggerItem>
              </Stack>
            </StaggerContainer>
          </GridCol>

          <GridCol span={{ base: 12, md: 5 }}>
            <StaggerContainer staggerChildren={0.08} delayChildren={0.2}>
              <Stack gap="md">
                <StaggerItem>
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon
                      variant="light"
                      color="green"
                      size={36}
                      radius="md"
                    >
                      <TrendingUp size={18} />
                    </ThemeIcon>
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Text fz="xs" tt="uppercase" fw={700} c="dimmed">
                        Total earned
                      </Text>
                      <Group gap="xs" wrap="wrap">
                        <AnimatedAmount
                          value={totalEarned}
                          currency={currency}
                        />
                        {approvedBonusBalance > 0 && (
                          <LinkAnchor
                            href="/dashboard/bonuses"
                            style={{ textDecoration: "none" }}
                          >
                            <Badge
                              size="xs"
                              variant="light"
                              color="violet"
                              leftSection={<Sparkles size={10} />}
                            >
                              +{formatAmount(approvedBonusBalance, currency)}{" "}
                              bonus approved &mdash; payment queued
                            </Badge>
                          </LinkAnchor>
                        )}
                      </Group>
                    </Stack>
                  </Group>
                </StaggerItem>

                <StaggerItem>
                  <Group gap="sm" wrap="nowrap">
                    <RingProgress
                      size={48}
                      thickness={5}
                      roundCaps
                      sections={[
                        {
                          value: Math.min(usagePct, 100),
                          color: progressColor,
                        },
                      ]}
                    />
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Group gap={4} wrap="nowrap">
                        <Text fz="xs" tt="uppercase" fw={700} c="dimmed">
                          Weekly credit
                        </Text>
                        <InfoTip term="weeklyCredit" />
                      </Group>
                      <Text fz="sm" fw={700}>
                        {formatAmount(weeklyUsed, currency)} /{" "}
                        {formatAmount(weeklyLimit, currency)}
                      </Text>
                      <Text fz="xs" c="dimmed">
                        {weeklyResetLabel}
                      </Text>
                    </Stack>
                  </Group>
                </StaggerItem>

                <StaggerItem>
                  <LinkAnchor
                    href="/dashboard/settings"
                    c="inherit"
                    style={{ display: "block", textDecoration: "none" }}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <ThemeIcon
                        variant="light"
                        color={
                          paymentMethodCurrency === "ROBUX" ? "violet" : "blue"
                        }
                        size={36}
                        radius="md"
                      >
                        <Wallet size={18} />
                      </ThemeIcon>
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Text fz="xs" tt="uppercase" fw={700} c="dimmed">
                          Payouts via
                        </Text>
                        <Text fz="sm" fw={600}>
                          {paymentMethodLabel}
                        </Text>
                        <Text
                          fz="xs"
                          c={isPaymentMethodSet ? "dimmed" : "yellow.4"}
                          truncate="end"
                        >
                          {paymentMethodDetail}
                        </Text>
                      </Stack>
                    </Group>
                  </LinkAnchor>
                </StaggerItem>
              </Stack>
            </StaggerContainer>
          </GridCol>
        </Grid>
      </MotionCard>
    </FadeIn>
  );
}
