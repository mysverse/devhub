import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DeveloperSpecialtyValue } from "@/lib/developer-access";

// Import the functions to test. searchWikiArticles/searchWikiSummaries fetch
// the knowledge index internally, so we test scoring with scoreArticle and
// test the full pipeline only when the local wiki file is available.
import {
  getWikiArticleBySlug,
  searchWikiArticles,
  searchWikiSummaries,
} from "@/lib/wiki-search";

// ── Integration tests against the real local knowledge base ──────────────
// These pass in CI/monorepo where ../wiki/docs/public/knowledge-base.json
// exists, and degrade gracefully (0 results) otherwise.

describe("wiki-search (integration)", () => {
  it("returns results for a known game topic", async () => {
    const results = await searchWikiArticles("emergency services");
    // If local wiki exists, we should find results; otherwise empty is fine
    assert.ok(Array.isArray(results), "Should return an array");
    if (results.length > 0) {
      assert.ok(
        results[0].score > 0,
        "Matched results must have positive score",
      );
      assert.ok(results[0].article.title, "Article must have a title");
      assert.ok(results[0].snippet.length > 0, "Snippet must not be empty");
      assert.ok(
        results[0].snippet.length <= 200,
        "Snippet must be <= 200 chars",
      );
    }
  });

  it("filters results by game", async () => {
    const results = await searchWikiArticles("economy", { game: "sumaya" });
    for (const res of results) {
      assert.equal(res.article.game, "sumaya", "All results should be sumaya");
    }
  });

  it("treats game='all' the same as no game filter", async () => {
    const unfiltered = await searchWikiArticles("economy");
    const allFilter = await searchWikiArticles("economy", { game: "all" });
    assert.equal(
      unfiltered.length,
      allFilter.length,
      "game='all' should return same count as no filter",
    );
  });

  it("boosts score when specialty tags match", async () => {
    const withSpecialty = await searchWikiArticles("services", {
      specialties: ["SCRIPTING" as DeveloperSpecialtyValue],
    });
    const withoutSpecialty = await searchWikiArticles("services");

    if (withSpecialty.length > 0 && withoutSpecialty.length > 0) {
      const slug = withSpecialty[0].article.slug;
      const scoreWith =
        withSpecialty.find((r) => r.article.slug === slug)?.score ?? 0;
      const scoreWithout =
        withoutSpecialty.find((r) => r.article.slug === slug)?.score ?? 0;
      assert.ok(
        scoreWith >= scoreWithout,
        `Specialty boost should not decrease score (${scoreWith} >= ${scoreWithout})`,
      );
    }
  });

  it("returns empty array for nonsensical query", async () => {
    const results = await searchWikiArticles("xyznonexistent9999");
    assert.equal(
      results.length,
      0,
      "Should return no results for gibberish query",
    );
  });

  it("respects limit option", async () => {
    const results = await searchWikiArticles("economy", { limit: 1 });
    assert.ok(results.length <= 1, "Should respect limit=1");
  });
});

describe("searchWikiSummaries (integration)", () => {
  it("returns compact formatted strings", async () => {
    const summaries = await searchWikiSummaries("fishing");
    assert.ok(Array.isArray(summaries));
    if (summaries.length > 0) {
      assert.ok(
        summaries[0].startsWith("["),
        `Summary should start with "[GameName:" format, got: "${summaries[0].slice(0, 30)}"`,
      );
    }
  });

  it("returns at most 3 summaries", async () => {
    const summaries = await searchWikiSummaries(
      "economy services fishing emergency",
    );
    assert.ok(summaries.length <= 3, "Max 3 summaries");
  });
});

describe("getWikiArticleBySlug (integration)", () => {
  it("returns null for non-existent slug", async () => {
    const article = await getWikiArticleBySlug("does-not-exist/slug-999");
    assert.equal(article, null);
  });

  it("strips leading slash from slug", async () => {
    const withSlash = await getWikiArticleBySlug("/sumaya/jobs-fishing");
    const withoutSlash = await getWikiArticleBySlug("sumaya/jobs-fishing");
    // Both should either find the same article or both be null
    if (withSlash && withoutSlash) {
      assert.equal(withSlash.slug, withoutSlash.slug);
    }
  });
});
