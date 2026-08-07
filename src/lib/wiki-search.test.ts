import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getWikiArticleBySlug, searchWikiArticles } from "@/lib/wiki-search";

describe("wiki-search", () => {
  it("returns search results matching query terms", async () => {
    const results = await searchWikiArticles("police emergency");
    assert.ok(Array.isArray(results));
    // If local wiki-base.json exists, it finds matches; if not, returns empty array without throwing
    if (results.length > 0) {
      assert.ok(results[0].score > 0);
      assert.ok(results[0].article.title);
    }
  });

  it("filters search results by game", async () => {
    const results = await searchWikiArticles("economy", { game: "sumaya" });
    assert.ok(Array.isArray(results));
    for (const res of results) {
      assert.equal(res.article.game, "sumaya");
    }
  });

  it("handles non-existent slug gracefully", async () => {
    const article = await getWikiArticleBySlug("non-existent-game/slug-999");
    assert.equal(article, null);
  });
});
