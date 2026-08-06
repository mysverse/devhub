import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_HISTORY,
  inferTaskSpecialties,
  type RecommendationProfile,
  type RecommendationTask,
  rankTasksForDeveloper,
} from "@/lib/task-recommendation";

function task(
  identifier: string,
  title: string,
  extra: Partial<RecommendationTask> = {},
): RecommendationTask {
  return {
    id: identifier,
    identifier,
    title,
    description: null,
    estimate: 3,
    labelNames: ["PPT"],
    ...extra,
  };
}

const SCRIPTER: RecommendationProfile = {
  specialties: ["SCRIPTING"],
  developerRank: "DEVELOPER",
};

describe("inferTaskSpecialties", () => {
  it("reads specialty out of the title when labels carry none", () => {
    // The real Linear workspace labels tasks "PPT"/"Bug"/"Enhancement" and
    // nothing about specialty, so title matching is the load-bearing signal.
    const inferred = inferTaskSpecialties(
      task("MYS-1", "Script ticket gate for rapid transit entrances"),
    );
    assert.ok(inferred.fromTitle.includes("SCRIPTING"));
  });

  it("prefers an explicit label over a title keyword", () => {
    const inferred = inferTaskSpecialties(
      task("MYS-2", "Script the crane", { labelNames: ["PPT", "Vehicles"] }),
    );
    assert.deepEqual(inferred.fromLabels, ["VEHICLES"]);
    assert.ok(!inferred.fromTitle.includes("VEHICLES"));
  });

  it("matches whole words only", () => {
    // "rapid" contains "api"; "drivetrain" contains "drive". Substring
    // matching would hand vehicle tasks to scripters and vice versa.
    const inferred = inferTaskSpecialties(task("MYS-3", "Rapid cleanup pass"));
    assert.ok(!inferred.fromTitle.includes("SCRIPTING"));
  });
});

describe("rankTasksForDeveloper", () => {
  it("puts a specialty match above a bigger unrelated task", () => {
    const ranked = rankTasksForDeveloper(
      [
        task("MYS-10", "Tune ambient lighting for night cycle", {
          estimate: 5,
        }),
        task("MYS-11", "Refactor the datastore module", { estimate: 2 }),
      ],
      SCRIPTER,
    );
    assert.equal(ranked[0].task.identifier, "MYS-11");
    assert.match(ranked[0].because, /Scripting specialty/);
  });

  it("ranks relevance above size for a newcomer", () => {
    // Regression: the "small first task" bonus once tied with a specialty
    // match, so a Building developer saw two unrelated small tasks above the
    // actual lighting task.
    const ranked = rankTasksForDeveloper(
      [
        task("MYS-1", "Fix the spawn timer", { estimate: 1 }),
        task("MYS-2", "Tune ambient lighting for night cycle", {
          estimate: 3,
        }),
      ],
      { specialties: ["BUILDING"], developerRank: "DEVELOPER" },
      EMPTY_HISTORY,
    );
    assert.equal(ranked[0].task.identifier, "MYS-2");
  });

  it("always explains itself, even with nothing matched", () => {
    const ranked = rankTasksForDeveloper(
      [task("MYS-20", "Tidy up the workspace folders", { estimate: 1 })],
      { specialties: [], developerRank: "DEVELOPER" },
    );
    assert.equal(ranked.length, 1);
    assert.ok(ranked[0].because.length > 0);
  });

  it("steers a developer with no history toward a small first task", () => {
    const ranked = rankTasksForDeveloper(
      [
        task("MYS-30", "Rework the whole economy system", { estimate: 5 }),
        task("MYS-31", "Fix the spawn timer", { estimate: 1 }),
      ],
      { specialties: [], developerRank: "JUNIOR_DEVELOPER" },
      EMPTY_HISTORY,
    );
    assert.equal(ranked[0].task.identifier, "MYS-31");
    assert.match(ranked[0].because, /small one to start/);
  });

  it("matches an experienced developer to their usual task size", () => {
    const ranked = rankTasksForDeveloper(
      [
        task("MYS-40", "Patch the radio script", { estimate: 1 }),
        task("MYS-41", "Rebuild the radio scripting layer", { estimate: 4 }),
      ],
      SCRIPTER,
      { completedEstimates: [4, 4, 3], completedSpecialties: ["SCRIPTING"] },
    );
    assert.equal(ranked[0].task.identifier, "MYS-41");
    assert.match(ranked[0].because, /size you usually take on/);
  });

  it("does not push level 5 tasks at probationary developers", () => {
    const heavy = task("MYS-50", "Script the whole vehicle system", {
      estimate: 5,
    });
    const light = task("MYS-51", "Script the horn toggle", { estimate: 2 });
    const ranked = rankTasksForDeveloper([heavy, light], {
      specialties: ["SCRIPTING"],
      developerRank: "PROBATIONARY_DEVELOPER",
    });
    assert.equal(ranked[0].task.identifier, "MYS-51");
  });

  it("is deterministic when scores tie", () => {
    const tasks = [
      task("MYS-62", "Untouched task"),
      task("MYS-60", "Untouched task"),
      task("MYS-61", "Untouched task"),
    ];
    const once = rankTasksForDeveloper(tasks, SCRIPTER);
    const twice = rankTasksForDeveloper([...tasks].reverse(), SCRIPTER);
    assert.deepEqual(
      once.map((r) => r.task.identifier),
      twice.map((r) => r.task.identifier),
    );
    assert.deepEqual(
      once.map((r) => r.task.identifier),
      ["MYS-60", "MYS-61", "MYS-62"],
    );
  });

  it("never drops tasks from the board", () => {
    const tasks = [task("MYS-70", "One"), task("MYS-71", "Two")];
    assert.equal(rankTasksForDeveloper(tasks, SCRIPTER).length, tasks.length);
  });
});
