import { getWikiKnowledgeIndex, type WikiArticle } from "@/lib/wiki-knowledge";

export type WikiSearchResult = {
  article: WikiArticle;
  score: number;
  snippet: string;
};

export type WikiSearchOptions = {
  game?: string | null;
  specialties?: string[];
  limit?: number;
};

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function specialtyToTags(specialty: string): string[] {
  const s = specialty.toUpperCase();
  if (s.includes("SCRIPT"))
    return ["scripting", "economy", "jobs", "emergency"];
  if (s.includes("BUILD") || s.includes("MAP") || s.includes("MODEL"))
    return ["building", "housing", "vehicles"];
  if (s.includes("UI") || s.includes("GUI")) return ["ui", "scripting"];
  if (s.includes("ANIM")) return ["combat", "emergency", "jobs"];
  return [];
}

export async function searchWikiArticles(
  query: string,
  options?: WikiSearchOptions,
): Promise<WikiSearchResult[]> {
  const index = await getWikiKnowledgeIndex();
  if (!index.articles.length) return [];

  const queryWords = new Set(normalizeWords(query));
  const gameFilter = options?.game?.toLowerCase() || null;
  const limit = options?.limit ?? 5;

  const targetSystemTags = new Set(
    (options?.specialties || []).flatMap(specialtyToTags),
  );

  const results: WikiSearchResult[] = [];

  for (const article of index.articles) {
    if (gameFilter && gameFilter !== "all" && article.game !== gameFilter) {
      continue;
    }

    let score = 0;
    const titleWords = normalizeWords(article.title);
    const descWords = normalizeWords(article.description);

    for (const word of queryWords) {
      if (titleWords.includes(word)) score += 50;
      if (descWords.includes(word)) score += 25;
      if (article.tags.includes(word)) score += 15;
      if (article.slug.includes(word)) score += 30;
    }

    if (article.systemTags) {
      for (const tag of article.systemTags) {
        if (targetSystemTags.has(tag)) score += 35;
      }
    }

    for (const section of article.sections) {
      const headingWords = normalizeWords(section.heading);
      const contentWords = normalizeWords(section.content || "");
      for (const word of queryWords) {
        if (headingWords.includes(word)) score += 20;
        if (contentWords.includes(word)) score += 5;
      }
    }

    if (score > 0) {
      const snippet =
        article.summary ||
        article.description ||
        article.sections[0]?.summary ||
        article.sections[0]?.content.slice(0, 180) ||
        (article.content ? article.content.slice(0, 180) : "");
      results.push({
        article,
        score,
        snippet: snippet.trim().slice(0, 200),
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/** Ultra-compact summaries for LLM prompt context injection (<= 180 tokens total). */
export async function searchWikiSummaries(
  query: string,
  options?: WikiSearchOptions,
): Promise<string[]> {
  const matches = await searchWikiArticles(query, { ...options, limit: 3 });
  return matches.map((m) => {
    const gameLabel =
      m.article.game.charAt(0).toUpperCase() + m.article.game.slice(1);
    const summaryText = m.article.summary || m.snippet;
    return `[${gameLabel}: ${m.article.title}] ${summaryText}`;
  });
}

export async function getWikiArticleBySlug(
  slug: string,
): Promise<WikiArticle | null> {
  const index = await getWikiKnowledgeIndex();
  const normalizedSlug = slug.toLowerCase().replace(/^\//, "");
  return (
    index.articles.find(
      (article) => article.slug.toLowerCase() === normalizedSlug,
    ) || null
  );
}
