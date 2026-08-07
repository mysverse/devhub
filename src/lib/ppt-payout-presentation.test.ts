import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { projectPptPayout } from "./ppt-payout-presentation";

describe("projected PPT payout presentation", () => {
  it("uses the normal MYR rate without a campaign", () => {
    const projection = projectPptPayout(3, "MYR");
    assert.equal(projection.baseAmount, 60);
    assert.equal(projection.finalAmount, 60);
    assert.equal(projection.finalLabel, "RM60.00");
    assert.equal(projection.multiplier, 1);
    assert.equal(projection.boosted, false);
  });

  it("applies the same multiplier to MYR and Robux", () => {
    const campaign = { multiplier: 3 };
    const myr = projectPptPayout(3, "MYR", campaign);
    const robux = projectPptPayout(3, "ROBUX", campaign);

    assert.equal(myr.finalAmount, 180);
    assert.equal(myr.finalLabel, "RM180.00");
    assert.equal(robux.finalAmount, 10_800);
    assert.equal(robux.finalLabel, "10,800 Robux");
    assert.equal(myr.multiplier, robux.multiplier);
  });

  it("multiplies the fallback range for an unestimated PPT", () => {
    const projection = projectPptPayout(null, "MYR", { multiplier: 2 });
    assert.equal(projection.baseLabel, "RM20.00 – RM100.00");
    assert.equal(projection.finalLabel, "RM40.00 – RM200.00");
    assert.equal(projection.finalAmount, null);
  });

  it("treats invalid multipliers as the normal rate", () => {
    assert.equal(
      projectPptPayout(2, "ROBUX", { multiplier: Number.NaN }).finalLabel,
      "2,400 Robux",
    );
  });
});

describe("PPT payout surface contract", () => {
  const projectionSurfaces = [
    "src/components/TaskCard.tsx",
    "src/app/dashboard/_components/ActiveTasks.tsx",
    "src/app/dashboard/_components/Hero.tsx",
    "src/app/dashboard/_components/Leaderboard.tsx",
    "src/app/dashboard/_components/HelpDrawer.tsx",
    "src/app/dashboard/ppts/page.tsx",
    "src/app/dashboard/ppts/PptRequestModal.tsx",
    "src/app/dashboard/ppts/MyPptRequests.tsx",
    "src/app/dashboard/admin/PptRequestCard.tsx",
    "src/app/dashboard/admin/PptRequestsTab.tsx",
    "src/app/api/ppt-requests/route.ts",
    "src/app/dashboard/admin/ppt-request-actions.ts",
    "src/lib/assistant-tools.ts",
  ];

  it("routes every projected payout surface through the shared helper", () => {
    for (const relativePath of projectionSurfaces) {
      const source = fs.readFileSync(path.join(process.cwd(), relativePath), {
        encoding: "utf8",
      });
      assert.match(
        source,
        /projectPptPayout/,
        `${relativePath} bypasses the shared PPT payout projection`,
      );
      assert.doesNotMatch(
        source,
        /applyMultiplier\s*\(/,
        `${relativePath} duplicates campaign payout math`,
      );
    }
  });

  it("passes a label-aware campaign to every TaskCard", () => {
    const taskCardSurfaces = [
      "src/app/dashboard/_components/SuggestedPPTs.tsx",
      "src/app/dashboard/_components/ActiveTasks.tsx",
      "src/app/dashboard/ppts/page.tsx",
    ];
    for (const relativePath of taskCardSurfaces) {
      const source = fs.readFileSync(
        path.join(process.cwd(), relativePath),
        "utf8",
      );
      const cards = source.match(/<TaskCard[\s\S]*?\/>/g) ?? [];
      assert.ok(cards.length > 0, `${relativePath} has no TaskCard to audit`);
      for (const card of cards) {
        assert.match(
          card,
          /campaign=/,
          `${relativePath} renders a TaskCard without campaign context`,
        );
      }
      assert.match(
        source,
        /labels:\s*issue\.labelNames/,
        `${relativePath} does not select campaigns from the issue labels`,
      );
    }
  });
});
