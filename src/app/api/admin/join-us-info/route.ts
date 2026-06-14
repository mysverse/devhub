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

    // 4. Perform text searches in JOIN_US.md if found
    const mdChecks = {
      pptMyrRateTextFound: /RM20\.00/i.test(joinUsText),
      pptRobuxRateTextFound: /1,200\s*Robux/i.test(joinUsText),
      weeklyThroughputTextFound:
        /Complete\s+5\s+or\s+more\s+qualifying\s+tasks/i.test(joinUsText) &&
        /RM30\.00\s*\/\s*1,800\s*Robux/i.test(joinUsText),
      milestone25TextFound:
        /25\s+Tasks\s+Completed:.*RM40\.00\s*\/\s*2,400\s*Robux/i.test(
          joinUsText,
        ),
      milestone50TextFound:
        /50\s+Tasks\s+Completed:.*RM75\.00\s*\/\s*4,500\s*Robux/i.test(
          joinUsText,
        ),
      milestone100TextFound:
        /100\s+Tasks\s+Completed:.*RM150\.00\s*\/\s*9,000\s*Robux/i.test(
          joinUsText,
        ),
      welcomePackShirtTextFound: /DevHub\s+T-Shirt/i.test(joinUsText),
      welcomePackStickersTextFound: /Custom\s+Sticker\s+Sheet/i.test(
        joinUsText,
      ),
      welcomePackLanyardTextFound: /Developer\s+ID\s+Card\s+&\s+Lanyard/i.test(
        joinUsText,
      ),
      welcomePackSizesTextFound: /S\s+to\s+XXL/i.test(joinUsText),
    };

    // 5. Compare Live Config with expectations
    const discrepancies: string[] = [];

    // PPT rates
    const pptRatesMatch = pptMyrRate === 20 && pptRobuxRate === 1200;
    if (pptMyrRate !== 20) {
      discrepancies.push(
        `PPT MYR multiplier is ${pptMyrRate}, expected 20 (RM20.00)`,
      );
    }
    if (pptRobuxRate !== 1200) {
      discrepancies.push(
        `PPT Robux multiplier is ${pptRobuxRate}, expected 1200`,
      );
    }

    // Weekly incentives
    const weeklyEnabledMatch = incentiveConfig.weeklyEnabled === true;
    if (!weeklyEnabledMatch) {
      discrepancies.push(
        "Weekly performance incentives are disabled in the live configuration",
      );
    }

    const activeWeeklyTier = parsedWeeklyTiers.find((t) => t.threshold === 5);
    const weeklyThroughputMatch =
      weeklyEnabledMatch &&
      activeWeeklyTier &&
      activeWeeklyTier.myr === 30 &&
      activeWeeklyTier.robux === 1800;

    if (weeklyEnabledMatch) {
      if (!activeWeeklyTier) {
        discrepancies.push(
          "No weekly incentive tier found for threshold 5 tasks",
        );
      } else {
        if (activeWeeklyTier.myr !== 30) {
          discrepancies.push(
            `Weekly incentive MYR payout for 5 tasks is RM${activeWeeklyTier.myr}, expected RM30.00`,
          );
        }
        if (activeWeeklyTier.robux !== 1800) {
          discrepancies.push(
            `Weekly incentive Robux payout for 5 tasks is ${activeWeeklyTier.robux}, expected 1800`,
          );
        }
      }
    }

    // Milestones
    const milestonesEnabledMatch = incentiveConfig.milestoneEnabled === true;
    if (!milestonesEnabledMatch) {
      discrepancies.push(
        "Milestone incentives are disabled in the live configuration",
      );
    }

    const m25 = parsedMilestones.find((m) => m.count === 25);
    const m50 = parsedMilestones.find((m) => m.count === 50);
    const m100 = parsedMilestones.find((m) => m.count === 100);

    const milestonesMatch =
      milestonesEnabledMatch &&
      m25 &&
      m25.myr === 40 &&
      m25.robux === 2400 &&
      m50 &&
      m50.myr === 75 &&
      m50.robux === 4500 &&
      m100 &&
      m100.myr === 150 &&
      m100.robux === 9000;

    if (milestonesEnabledMatch) {
      if (m25?.myr !== 40 || m25?.robux !== 2400) {
        discrepancies.push(
          `Milestone 25 completed tasks payout is RM${m25?.myr ?? "N/A"} / ${m25?.robux ?? "N/A"} Robux, expected RM40.00 / 2,400 Robux`,
        );
      }
      if (m50?.myr !== 75 || m50?.robux !== 4500) {
        discrepancies.push(
          `Milestone 50 completed tasks payout is RM${m50?.myr ?? "N/A"} / ${m50?.robux ?? "N/A"} Robux, expected RM75.00 / 4,500 Robux`,
        );
      }
      if (m100?.myr !== 150 || m100?.robux !== 9000) {
        discrepancies.push(
          `Milestone 100 completed tasks payout is RM${m100?.myr ?? "N/A"} / ${m100?.robux ?? "N/A"} Robux, expected RM150.00 / 9,000 Robux`,
        );
      }
    }

    // Monthly Discretionary Bonus rates
    const bonusRatesMatch =
      bonusConfig.myrRatePerPoint === 20 &&
      bonusConfig.robuxRatePerPoint === 1200;
    if (bonusConfig.myrRatePerPoint !== 20) {
      discrepancies.push(
        `Discretionary bonus MYR rate per point is ${bonusConfig.myrRatePerPoint}, expected 20 (RM20.00)`,
      );
    }
    if (bonusConfig.robuxRatePerPoint !== 1200) {
      discrepancies.push(
        `Discretionary bonus Robux rate per point is ${bonusConfig.robuxRatePerPoint}, expected 1200`,
      );
    }

    const hasRedistributableExclusion = bonusExclusions.some(
      (label) => label.toLowerCase() === "redistributable",
    );
    const hasRedistributedExclusion = bonusExclusions.some(
      (label) => label.toLowerCase() === "redistributed",
    );
    const bonusExclusionsMatch =
      hasRedistributableExclusion && hasRedistributedExclusion;
    if (!hasRedistributableExclusion) {
      discrepancies.push(
        "Bonus configuration is missing the 'Redistributable' label exclusion",
      );
    }
    if (!hasRedistributedExclusion) {
      discrepancies.push(
        "Bonus configuration is missing the 'Redistributed' label exclusion",
      );
    }

    // Welcome pack items
    let welcomePackMatch = false;
    let packName: string | null = null;
    const itemsReport: Array<{
      name: string;
      requiresSize: boolean;
      sizeOptions: string[];
    }> = [];

    if (welcomePack) {
      packName = welcomePack.name;
      const items = welcomePack.items;

      const shirtItem = items.find(
        (item) =>
          item.name.toLowerCase().includes("t-shirt") ||
          item.name.toLowerCase().includes("tee"),
      );
      const stickersItem = items.find((item) =>
        item.name.toLowerCase().includes("sticker"),
      );
      const lanyardItem = items.find(
        (item) =>
          item.name.toLowerCase().includes("lanyard") ||
          item.name.toLowerCase().includes("id card"),
      );

      const hasShirt = !!shirtItem;
      const hasStickers = !!stickersItem;
      const hasLanyard = !!lanyardItem;
      const shirtSizesCorrect =
        shirtItem?.requiresSize &&
        ["S", "M", "L", "XL", "XXL"].every((size) =>
          shirtItem.sizeOptions.includes(size),
        );

      welcomePackMatch =
        hasShirt && hasStickers && hasLanyard && !!shirtSizesCorrect;

      if (!hasShirt)
        discrepancies.push("Active Welcome Pack is missing a T-shirt item");
      if (hasShirt && !shirtSizesCorrect) {
        discrepancies.push(
          `Welcome Pack T-shirt size options are [${shirtItem?.sizeOptions.join(", ")}], expected to include S, M, L, XL, XXL`,
        );
      }
      if (!hasStickers) {
        discrepancies.push(
          "Active Welcome Pack is missing a Sticker sheet item",
        );
      }
      if (!hasLanyard) {
        discrepancies.push(
          "Active Welcome Pack is missing a Lanyard / ID Card item",
        );
      }

      for (const item of items) {
        itemsReport.push({
          name: item.name,
          requiresSize: item.requiresSize,
          sizeOptions: item.sizeOptions,
        });
      }
    } else {
      discrepancies.push("No active Welcome Pack found in the database");
    }

    // Markdown file text checks
    if (fileFound) {
      if (!mdChecks.pptMyrRateTextFound) {
        discrepancies.push(
          "JOIN_US.md text is missing the standard PPT MYR rate of 'RM20.00'",
        );
      }
      if (!mdChecks.pptRobuxRateTextFound) {
        discrepancies.push(
          "JOIN_US.md text is missing the standard PPT Robux rate of '1,200 Robux'",
        );
      }
      if (!mdChecks.weeklyThroughputTextFound) {
        discrepancies.push(
          "JOIN_US.md text is missing the weekly throughput reward rate of 'RM30.00 / 1,800 Robux' or threshold of 5 tasks",
        );
      }
      if (!mdChecks.milestone25TextFound) {
        discrepancies.push(
          "JOIN_US.md text is missing or has incorrect description for 25 Completed Tasks milestone",
        );
      }
      if (!mdChecks.milestone50TextFound) {
        discrepancies.push(
          "JOIN_US.md text is missing or has incorrect description for 50 Completed Tasks milestone",
        );
      }
      if (!mdChecks.milestone100TextFound) {
        discrepancies.push(
          "JOIN_US.md text is missing or has incorrect description for 100 Completed Tasks milestone",
        );
      }
      if (!mdChecks.welcomePackShirtTextFound) {
        discrepancies.push(
          "JOIN_US.md text is missing reference to 'DevHub T-Shirt'",
        );
      }
      if (!mdChecks.welcomePackStickersTextFound) {
        discrepancies.push(
          "JOIN_US.md text is missing reference to 'Custom Sticker Sheet'",
        );
      }
      if (!mdChecks.welcomePackLanyardTextFound) {
        discrepancies.push(
          "JOIN_US.md text is missing reference to 'Developer ID Card & Lanyard'",
        );
      }
      if (!mdChecks.welcomePackSizesTextFound) {
        discrepancies.push(
          "JOIN_US.md text is missing reference to sizes 'S to XXL'",
        );
      }
    } else {
      discrepancies.push(
        "JOIN_US.md file could not be read or does not exist at workspace root",
      );
    }

    const overallAccuracy = discrepancies.length === 0;

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
          expected: "RM20.00 per point, 1,200 Robux per point",
          actual: `MYR: RM${pptMyrRate.toFixed(2)} per point, Robux: ${pptRobuxRate.toLocaleString()} Robux per point`,
          match:
            pptRatesMatch &&
            mdChecks.pptMyrRateTextFound &&
            mdChecks.pptRobuxRateTextFound,
        },
        weeklyThroughput: {
          section: "2. Weekly Performance Incentives - Throughput",
          expected: "Complete 5 or more tasks for RM30.00 / 1,800 Robux",
          actual: activeWeeklyTier
            ? `Threshold: ${activeWeeklyTier.threshold} tasks, Reward: RM${activeWeeklyTier.myr.toFixed(2)} / ${activeWeeklyTier.robux.toLocaleString()} Robux (Enabled: ${incentiveConfig.weeklyEnabled})`
            : "No tier 5 found or incentives disabled",
          match: weeklyThroughputMatch && mdChecks.weeklyThroughputTextFound,
        },
        milestones: {
          section: "2. Weekly & Lifetime Performance Incentives - Milestones",
          expected:
            "25 Tasks (RM40/2400 Robux), 50 Tasks (RM75/4500 Robux), 100 Tasks (RM150/9000 Robux)",
          actual: parsedMilestones
            .map((m) => `${m.count} Tasks (RM${m.myr}/${m.robux})`)
            .join(", "),
          match:
            milestonesMatch &&
            mdChecks.milestone25TextFound &&
            mdChecks.milestone50TextFound &&
            mdChecks.milestone100TextFound,
        },
        bonusConfig: {
          section: "3. Discretionary Monthly Bonuses",
          expected:
            "MYR: 20 per point, Robux: 1200 per point. Exclude 'Redistributable', 'Redistributed'",
          actual: `MYR: ${bonusConfig.myrRatePerPoint} per point, Robux: ${bonusConfig.robuxRatePerPoint} per point. Exclusions: ${bonusExclusions.join(", ")}`,
          match: bonusRatesMatch && bonusExclusionsMatch,
        },
        welcomePack: {
          section: "4. The MYSverse Founders Welcome Pack",
          expected:
            "DevHub T-Shirt (size S to XXL), Custom Sticker Sheet, Developer ID Card & Lanyard",
          actual: welcomePack
            ? `Active Pack: '${packName}'. Items: ${itemsReport.map((i) => `${i.name}${i.requiresSize ? ` (${i.sizeOptions.join(",")})` : ""}`).join(", ")}`
            : "No active welcome pack found",
          match:
            welcomePackMatch &&
            mdChecks.welcomePackShirtTextFound &&
            mdChecks.welcomePackStickersTextFound &&
            mdChecks.welcomePackLanyardTextFound &&
            mdChecks.welcomePackSizesTextFound,
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
      markdownTextChecks: mdChecks,
    });
  } catch (error) {
    console.error("Failed to compile JOIN_US.md verification info", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: String(error) },
      { status: 500 },
    );
  }
}
