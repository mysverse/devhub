import fs from "node:fs";
import path from "node:path";
import type { IncentiveConfig } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { getBonusConfig, getEffectiveExcludedLabels } from "@/lib/bonus";
import { estimateToAmount } from "@/lib/currency";
import { getIncentiveConfig } from "@/lib/incentives";
import prisma from "@/lib/prisma";

interface WeeklyTier {
  threshold: number;
  myr: number;
  robux: number;
}

interface Milestone {
  count: number;
  myr: number;
  robux: number;
}

const DEFAULT_MILESTONES: Milestone[] = [
  { count: 25, myr: 40, robux: 2400 },
  { count: 50, myr: 75, robux: 4500 },
  { count: 100, myr: 150, robux: 9000 },
];

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseWeeklyTiers(config: IncentiveConfig): WeeklyTier[] {
  const rawTiers = jsonArray(config.weeklyTiers);
  const tiers = rawTiers
    .map((item) => {
      if (typeof item !== "object" || !item) return null;
      const record = item as Record<string, unknown>;
      const threshold = Number(record.threshold);
      const myr = Number(record.myr);
      const robux = Number(record.robux);
      if (!Number.isFinite(threshold) || threshold <= 0) return null;
      return {
        threshold: Math.floor(threshold),
        myr: Number.isFinite(myr) && myr > 0 ? myr : config.weeklyMyrAmount,
        robux:
          Number.isFinite(robux) && robux > 0
            ? robux
            : config.weeklyRobuxAmount,
      };
    })
    .filter((tier): tier is WeeklyTier => Boolean(tier));

  if (tiers.length === 0) {
    return [
      {
        threshold: config.weeklyThreshold,
        myr: config.weeklyMyrAmount,
        robux: config.weeklyRobuxAmount,
      },
    ];
  }

  return tiers.sort((a, b) => a.threshold - b.threshold);
}

function parseMilestones(config: IncentiveConfig): Milestone[] {
  const rawMilestones = jsonArray(config.milestones);
  const milestones = rawMilestones
    .map((item) => {
      if (typeof item !== "object" || !item) return null;
      const record = item as Record<string, unknown>;
      const count = Number(record.count);
      const myr = Number(record.myr);
      const robux = Number(record.robux);
      if (!Number.isFinite(count) || count <= 0) return null;
      return {
        count: Math.floor(count),
        myr: Number.isFinite(myr) && myr > 0 ? myr : config.weeklyMyrAmount,
        robux:
          Number.isFinite(robux) && robux > 0
            ? robux
            : config.weeklyRobuxAmount,
      };
    })
    .filter((milestone): milestone is Milestone => Boolean(milestone));

  return (milestones.length > 0 ? milestones : DEFAULT_MILESTONES).sort(
    (a, b) => a.count - b.count,
  );
}

function includesAmount(text: string, amount: number, prefix = "RM"): boolean {
  const formats = [
    `${prefix}${amount}`,
    `${prefix}${amount.toFixed(2)}`,
    `${prefix}${amount.toLocaleString()}`,
  ];
  return formats.some((f) => text.includes(f));
}

function includesRobux(text: string, amount: number): boolean {
  const formatted = amount.toLocaleString();
  const formats = [`${formatted} Robux`, `${amount} Robux`];
  const cleanedText = text.replace(/\s+/g, " ");
  return formats.some((f) => cleanedText.includes(f));
}

export async function GET() {
  try {
    // 1. Verify admin permissions
    await requireAdmin();
  } catch (_error) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 },
    );
  }

  try {
    // 2. Fetch live configurations
    const pptMyrRate = estimateToAmount(1, "MYR");
    const pptRobuxRate = estimateToAmount(1, "ROBUX");

    const incentiveConfig = await getIncentiveConfig();
    const bonusConfig = await getBonusConfig();
    const bonusExclusions = getEffectiveExcludedLabels(bonusConfig);

    const welcomePack = await prisma.welcomePack.findFirst({
      where: { isActive: true },
      include: { items: { where: { isActive: true } } },
    });

    const parsedWeeklyTiers = parseWeeklyTiers(incentiveConfig);
    const parsedMilestones = parseMilestones(incentiveConfig);

    // 3. Read JOIN_US.md from filesystem
    let joinUsText = "";
    let fileFound = false;
    try {
      const filePath = path.join(process.cwd(), "JOIN_US.md");
      if (fs.existsSync(filePath)) {
        joinUsText = fs.readFileSync(filePath, "utf-8");
        fileFound = true;
      }
    } catch (error) {
      console.error("Failed to read JOIN_US.md", error);
    }

    const discrepancies: string[] = [];

    if (fileFound) {
      // PPT rates checks
      if (!includesAmount(joinUsText, pptMyrRate)) {
        discrepancies.push(
          `JOIN_US.md is missing the live PPT MYR rate of RM${pptMyrRate}`,
        );
      }
      if (!includesRobux(joinUsText, pptRobuxRate)) {
        discrepancies.push(
          `JOIN_US.md is missing the live PPT Robux rate of ${pptRobuxRate.toLocaleString()} Robux`,
        );
      }

      // Weekly incentives checks
      if (incentiveConfig.weeklyEnabled) {
        const activeWeeklyTier = parsedWeeklyTiers.find(
          (t) => t.threshold === 5,
        );
        if (!activeWeeklyTier) {
          discrepancies.push(
            "No live weekly incentive tier found for threshold 5 tasks",
          );
        } else {
          if (!joinUsText.includes(`${activeWeeklyTier.threshold} or more`)) {
            discrepancies.push(
              `JOIN_US.md does not mention the weekly threshold of ${activeWeeklyTier.threshold} tasks`,
            );
          }
          if (!includesAmount(joinUsText, activeWeeklyTier.myr)) {
            discrepancies.push(
              `JOIN_US.md does not mention the weekly reward of RM${activeWeeklyTier.myr}`,
            );
          }
          if (!includesRobux(joinUsText, activeWeeklyTier.robux)) {
            discrepancies.push(
              `JOIN_US.md does not mention the weekly reward of ${activeWeeklyTier.robux.toLocaleString()} Robux`,
            );
          }
        }
      } else {
        discrepancies.push(
          "Weekly performance incentives are disabled in the live configuration",
        );
      }

      // Milestones checks
      if (incentiveConfig.milestoneEnabled) {
        for (const m of parsedMilestones) {
          const milestoneDesc = `${m.count} Tasks`;
          if (!joinUsText.includes(milestoneDesc)) {
            discrepancies.push(
              `JOIN_US.md is missing a description for the ${m.count} completed tasks milestone`,
            );
          }
          if (!includesAmount(joinUsText, m.myr)) {
            discrepancies.push(
              `JOIN_US.md is missing the reward of RM${m.myr} for the ${m.count} tasks milestone`,
            );
          }
          if (!includesRobux(joinUsText, m.robux)) {
            discrepancies.push(
              `JOIN_US.md is missing the reward of ${m.robux.toLocaleString()} Robux for the ${m.count} tasks milestone`,
            );
          }
        }
      } else {
        discrepancies.push(
          "Milestone incentives are disabled in the live configuration",
        );
      }

      // Bonus checks
      if (bonusConfig.enabled) {
        if (!includesAmount(joinUsText, bonusConfig.myrRatePerPoint)) {
          discrepancies.push(
            `JOIN_US.md is missing the discretionary bonus rate of RM${bonusConfig.myrRatePerPoint}`,
          );
        }
        if (!includesRobux(joinUsText, bonusConfig.robuxRatePerPoint)) {
          discrepancies.push(
            `JOIN_US.md is missing the discretionary bonus rate of ${bonusConfig.robuxRatePerPoint.toLocaleString()} Robux`,
          );
        }
      }

      // Welcome pack checks
      if (welcomePack) {
        if (
          !joinUsText.toLowerCase().includes(welcomePack.name.toLowerCase())
        ) {
          discrepancies.push(
            `JOIN_US.md is missing the active welcome pack name: "${welcomePack.name}"`,
          );
        }
        for (const item of welcomePack.items) {
          if (!joinUsText.toLowerCase().includes(item.name.toLowerCase())) {
            discrepancies.push(
              `JOIN_US.md does not list the welcome pack item: "${item.name}"`,
            );
          }
          if (item.requiresSize && item.sizeOptions.length > 0) {
            const rangeStr = `${item.sizeOptions[0]} to ${
              item.sizeOptions[item.sizeOptions.length - 1]
            }`;
            if (!joinUsText.toLowerCase().includes(rangeStr.toLowerCase())) {
              discrepancies.push(
                `JOIN_US.md is missing size options "${rangeStr}" for item "${item.name}"`,
              );
            }
          }
        }
      } else {
        discrepancies.push("No active Welcome Pack found in the database");
      }
    } else {
      discrepancies.push(
        "JOIN_US.md file could not be read or does not exist at workspace root",
      );
    }

    const overallAccuracy = discrepancies.length === 0;

    const itemsReport = welcomePack
      ? welcomePack.items.map((item) => ({
          name: item.name,
          requiresSize: item.requiresSize,
          sizeOptions: item.sizeOptions,
        }))
      : [];

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      fileStatus: {
        path: "JOIN_US.md",
        exists: fileFound,
        byteSize: joinUsText.length,
      },
      overallAccuracy,
      discrepancies,
      verifications: {
        pptRates: {
          section: "1. Guaranteed Task Payouts (PPT)",
          expected: `RM${pptMyrRate.toFixed(2)} per point, ${pptRobuxRate.toLocaleString()} Robux per point`,
          actual: `MYR: RM${pptMyrRate.toFixed(2)} per point, Robux: ${pptRobuxRate.toLocaleString()} Robux per point`,
          match:
            includesAmount(joinUsText, pptMyrRate) &&
            includesRobux(joinUsText, pptRobuxRate),
        },
        weeklyThroughput: {
          section: "2. Weekly Performance Incentives - Throughput",
          expected: `Complete 5 or more tasks for RM${parsedWeeklyTiers.find((t) => t.threshold === 5)?.myr ?? 30} / ${(parsedWeeklyTiers.find((t) => t.threshold === 5)?.robux ?? 1800).toLocaleString()} Robux`,
          actual: parsedWeeklyTiers.find((t) => t.threshold === 5)
            ? `Threshold: 5 tasks, Reward: RM${parsedWeeklyTiers.find((t) => t.threshold === 5)?.myr.toFixed(2)} / ${parsedWeeklyTiers.find((t) => t.threshold === 5)?.robux.toLocaleString()} Robux (Enabled: ${incentiveConfig.weeklyEnabled})`
            : "No tier 5 found or incentives disabled",
          match:
            incentiveConfig.weeklyEnabled &&
            joinUsText.includes("5 or more") &&
            includesAmount(
              joinUsText,
              parsedWeeklyTiers.find((t) => t.threshold === 5)?.myr ?? 30,
            ) &&
            includesRobux(
              joinUsText,
              parsedWeeklyTiers.find((t) => t.threshold === 5)?.robux ?? 1800,
            ),
        },
        milestones: {
          section: "2. Weekly & Lifetime Performance Incentives - Milestones",
          expected: parsedMilestones
            .map((m) => `${m.count} Tasks (RM${m.myr}/${m.robux})`)
            .join(", "),
          actual: parsedMilestones
            .map((m) => `${m.count} Tasks (RM${m.myr}/${m.robux})`)
            .join(", "),
          match: parsedMilestones.every(
            (m) =>
              joinUsText.includes(`${m.count} Tasks`) &&
              includesAmount(joinUsText, m.myr) &&
              includesRobux(joinUsText, m.robux),
          ),
        },
        bonusConfig: {
          section: "3. Discretionary Monthly Bonuses",
          expected: `MYR: ${bonusConfig.myrRatePerPoint} per point, Robux: ${bonusConfig.robuxRatePerPoint} per point. Exclusions: 'Redistributable', 'Redistributed'`,
          actual: `MYR: ${bonusConfig.myrRatePerPoint} per point, Robux: ${
            bonusConfig.robuxRatePerPoint
          } per point. Exclusions: ${bonusExclusions.join(", ")}`,
          match:
            includesAmount(joinUsText, bonusConfig.myrRatePerPoint) &&
            includesRobux(joinUsText, bonusConfig.robuxRatePerPoint),
        },
        welcomePack: {
          section: "4. The MYSverse Welcome Pack",
          expected: welcomePack
            ? `Active Pack: '${welcomePack.name}'. Items: ${welcomePack.items
                .map((i) => {
                  const rangeStr =
                    i.requiresSize && i.sizeOptions.length > 0
                      ? ` (${i.sizeOptions[0]} to ${
                          i.sizeOptions[i.sizeOptions.length - 1]
                        })`
                      : "";
                  return `${i.name}${rangeStr}`;
                })
                .join(", ")}`
            : "No active welcome pack found",
          actual: welcomePack
            ? `Active Pack: '${welcomePack.name}'. Items: ${itemsReport
                .map(
                  (i) =>
                    `${i.name}${
                      i.requiresSize ? ` (${i.sizeOptions.join(",")})` : ""
                    }`,
                )
                .join(", ")}`
            : "No active welcome pack found",
          match:
            welcomePack &&
            joinUsText.toLowerCase().includes(welcomePack.name.toLowerCase()) &&
            welcomePack.items.every(
              (item) =>
                joinUsText.toLowerCase().includes(item.name.toLowerCase()) &&
                (!item.requiresSize ||
                  item.sizeOptions.length === 0 ||
                  joinUsText
                    .toLowerCase()
                    .includes(
                      `${item.sizeOptions[0]} to ${
                        item.sizeOptions[item.sizeOptions.length - 1]
                      }`.toLowerCase(),
                    )),
            ),
        },
      },
      liveConfiguration: {
        ppt: {
          myrRatePerPoint: pptMyrRate,
          robuxRatePerPoint: pptRobuxRate,
        },
        weeklyIncentives: {
          enabled: incentiveConfig.weeklyEnabled,
          threshold: incentiveConfig.weeklyThreshold,
          myrAmount: incentiveConfig.weeklyMyrAmount,
          robuxAmount: incentiveConfig.weeklyRobuxAmount,
          tiers: parsedWeeklyTiers,
        },
        milestones: {
          enabled: incentiveConfig.milestoneEnabled,
          milestones: parsedMilestones,
        },
        activeDayKicker: {
          enabled: incentiveConfig.activeDayKickerEnabled,
          threshold: incentiveConfig.activeDayThreshold,
          myrAmount: incentiveConfig.activeDayKickerMyr,
          robuxAmount: incentiveConfig.activeDayKickerRobux,
        },
        streak: {
          enabled: incentiveConfig.streakEnabled,
          thresholdWeeks: incentiveConfig.streakThresholdWeeks,
          myrAmount: incentiveConfig.streakMyrAmount,
          robuxAmount: incentiveConfig.streakRobuxAmount,
        },
        bonus: {
          enabled: bonusConfig.enabled,
          myrRatePerPoint: bonusConfig.myrRatePerPoint,
          robuxRatePerPoint: bonusConfig.robuxRatePerPoint,
          excludedLabels: bonusExclusions,
        },
        welcomePack: welcomePack
          ? {
              id: welcomePack.id,
              name: welcomePack.name,
              currentWave: welcomePack.currentWave,
              items: itemsReport,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Failed to compile JOIN_US.md verification info", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: String(error) },
      { status: 500 },
    );
  }
}
