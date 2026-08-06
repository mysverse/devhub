import {
  DEVELOPER_SPECIALTY_LABELS,
  type DeveloperRankValue,
  type DeveloperSpecialtyValue,
} from "@/lib/developer-access";

// Ranks open PPTs for one developer and says why, so the board can stop being
// an undifferentiated list everyone has to self-serve from. Pure and
// client-safe (no Prisma, no Linear client) — the same ranking feeds the
// dashboard block, the board, and the weekly digest, so what a developer is
// told by email matches what they see when they arrive.
//
// Every recommendation carries a `because`. A ranked list with no stated
// reason reads as a lottery, which is worse than no ranking at all.

export type RecommendationTask = {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  estimate: number | null;
  labelNames: string[];
};

export type RecommendationProfile = {
  specialties: DeveloperSpecialtyValue[];
  developerRank: DeveloperRankValue;
};

export type RecommendationHistory = {
  /** Complexity estimates of PPTs this developer has already been paid for. */
  completedEstimates: number[];
  /** Specialties inferred from what they have finished before. */
  completedSpecialties: DeveloperSpecialtyValue[];
};

export const EMPTY_HISTORY: RecommendationHistory = {
  completedEstimates: [],
  completedSpecialties: [],
};

/**
 * Words that mark a task as belonging to a specialty. The Linear workspace
 * does not reliably carry specialty labels, so matching on labels alone would
 * rank nothing — titles are where the signal actually lives.
 */
const SPECIALTY_KEYWORDS: Record<DeveloperSpecialtyValue, string[]> = {
  SCRIPTING: [
    "script",
    "scripting",
    "code",
    "luau",
    "lua",
    "module",
    "remote",
    "api",
    "endpoint",
    "datastore",
    "refactor",
    "callback",
    "handler",
    "event",
    "server",
    "client",
    "crash",
    "bug",
  ],
  BUILDING: [
    "build",
    "building",
    "map",
    "terrain",
    "lighting",
    "ambient",
    "environment",
    "layout",
    "scene",
    "interior",
    "exterior",
    "world",
    "place",
  ],
  MESHING: [
    "mesh",
    "model",
    "asset",
    "texture",
    "material",
    "uv",
    "blender",
    "geometry",
    "lod",
    "rig",
    "prop",
    "decal",
  ],
  VEHICLES: [
    "vehicle",
    "car",
    "truck",
    "boat",
    "plane",
    "train",
    "transit",
    "chassis",
    "suspension",
    "wheel",
    "steering",
    "crane",
    "drive",
  ],
};

const SPECIALTY_VALUES = Object.keys(
  SPECIALTY_KEYWORDS,
) as DeveloperSpecialtyValue[];

/** Ranks that shouldn't be steered toward the largest tasks first. */
const JUNIOR_RANKS = new Set<DeveloperRankValue>([
  "PROBATIONARY_DEVELOPER",
  "JUNIOR_DEVELOPER",
]);

/** Where someone with no completed PPTs should start. */
const FIRST_TASK_MAX_ESTIMATE = 2;

function matchesWord(haystack: string, word: string) {
  // Word boundaries matter more than they look: "rapid transit" contains
  // "api", and "drivetrain" shouldn't be the reason a scripting task is
  // recommended to a vehicles developer.
  return new RegExp(`\\b${word}\\b`, "i").test(haystack);
}

function specialtiesIn(text: string): DeveloperSpecialtyValue[] {
  if (!text.trim()) return [];
  return SPECIALTY_VALUES.filter((specialty) =>
    SPECIALTY_KEYWORDS[specialty].some((word) => matchesWord(text, word)),
  );
}

/**
 * What a task appears to be about. An explicit Linear label wins over a word
 * in the title, and the title wins over the description.
 */
export function inferTaskSpecialties(task: RecommendationTask): {
  fromLabels: DeveloperSpecialtyValue[];
  fromTitle: DeveloperSpecialtyValue[];
  fromDescription: DeveloperSpecialtyValue[];
} {
  const labelText = task.labelNames.join(" ");
  const fromLabels = SPECIALTY_VALUES.filter(
    (specialty) =>
      matchesWord(labelText, specialty) ||
      matchesWord(labelText, DEVELOPER_SPECIALTY_LABELS[specialty]) ||
      SPECIALTY_KEYWORDS[specialty].some((word) =>
        matchesWord(labelText, word),
      ),
  );
  const fromTitle = specialtiesIn(task.title).filter(
    (specialty) => !fromLabels.includes(specialty),
  );
  const fromDescription = specialtiesIn(task.description ?? "").filter(
    (specialty) =>
      !fromLabels.includes(specialty) && !fromTitle.includes(specialty),
  );
  return { fromLabels, fromTitle, fromDescription };
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export type RankedTask = {
  task: RecommendationTask;
  score: number;
  /** Why this task, in the developer's own terms. Never empty. */
  because: string;
  matchedSpecialties: DeveloperSpecialtyValue[];
};

function listSpecialties(specialties: DeveloperSpecialtyValue[]) {
  const labels = specialties.map((s) => DEVELOPER_SPECIALTY_LABELS[s]);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

/**
 * Highest score first, ties broken by identifier so the order never shuffles
 * between renders. Tasks that match nothing still appear — a shorter list
 * would just be the board with information removed.
 */
export function rankTasksForDeveloper(
  tasks: RecommendationTask[],
  profile: RecommendationProfile,
  history: RecommendationHistory = EMPTY_HISTORY,
): RankedTask[] {
  const declared = new Set(profile.specialties);
  const proven = new Set(history.completedSpecialties);
  const typicalEstimate = median(history.completedEstimates);
  const isNewcomer = history.completedEstimates.length === 0;
  const isJunior = JUNIOR_RANKS.has(profile.developerRank);

  return tasks
    .map((task) => {
      const inferred = inferTaskSpecialties(task);
      const matched = new Set<DeveloperSpecialtyValue>();
      let score = 0;
      const reasons: string[] = [];

      for (const specialty of inferred.fromLabels) {
        if (declared.has(specialty)) {
          score += 5;
          matched.add(specialty);
        }
      }
      for (const specialty of inferred.fromTitle) {
        if (declared.has(specialty)) {
          score += 4;
          matched.add(specialty);
        }
      }
      for (const specialty of inferred.fromDescription) {
        if (declared.has(specialty)) {
          score += 1;
          matched.add(specialty);
        }
      }
      if (matched.size > 0) {
        reasons.push(`matches your ${listSpecialties([...matched])} specialty`);
      }

      const allInferred = [
        ...inferred.fromLabels,
        ...inferred.fromTitle,
        ...inferred.fromDescription,
      ];
      const provenMatch = allInferred.filter(
        (specialty) => proven.has(specialty) && !matched.has(specialty),
      );
      if (provenMatch.length > 0) {
        score += 2;
        reasons.push(`similar to work you've finished before`);
      }

      const estimate = task.estimate ?? 0;
      if (isNewcomer) {
        // No history: a small first task is far likelier to actually get
        // finished than the biggest one on the board.
        if (estimate > 0 && estimate <= FIRST_TASK_MAX_ESTIMATE) {
          score += 2;
          reasons.push("a small one to start with");
        }
      } else if (typicalEstimate !== null && estimate > 0) {
        const distance = Math.abs(estimate - typicalEstimate);
        if (distance <= 0.5) {
          score += 2;
          reasons.push("about the size you usually take on");
        } else if (distance <= 1.5) {
          score += 1;
        }
      }

      if (isJunior && estimate >= 5) score -= 2;

      // Nothing matched, but it's still a real task worth naming.
      if (reasons.length === 0) {
        reasons.push(
          estimate > 0
            ? `open on the board, ${estimate} points`
            : "open on the board",
        );
      }

      return {
        task,
        score,
        because: reasons.join(" · "),
        matchedSpecialties: [...matched],
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.task.identifier.localeCompare(b.task.identifier),
    );
}
