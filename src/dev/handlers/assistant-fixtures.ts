import { LINEAR_PROJECT_LEBUHRAYA, LINEAR_TEAM } from "@/dev/fixtures/linear";

export const CAR_PPT_PAYLOAD = {
  mode: "new",
  linearIssueId: null,
  title: "Create a realistic Proton X90-inspired civilian car",
  teamId: LINEAR_TEAM.id,
  projectId: LINEAR_PROJECT_LEBUHRAYA.id,
  projectName: LINEAR_PROJECT_LEBUHRAYA.name,
  description:
    "Create one Roblox-ready civilian SUV inspired by the Proton X90. Include a realistic exterior, basic interior, clean materials, correct scale, pivots, and an optimized game-ready import. Exclude driving physics and animations.\n\nAcceptance criteria:\n- Exterior is recognizable and complete from all sides.\n- Basic interior is visible through the windows.\n- Materials, scale, orientation, and pivots are correct in Roblox.\n- Asset has no major modeling, shading, or clipping errors.\n- Model is organized and optimized for later vehicle setup.",
  note: "Prepared from the assistant working draft for Lebuhraya.",
  estimate: 3,
  dueDate: "2026-08-31",
  assigneeIntent: "SELF",
} as const;
