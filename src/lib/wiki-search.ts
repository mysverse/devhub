import { getWikiKnowledgeIndex, type WikiArticle } from "@/lib/wiki-knowledge";

export type WikiSearchResult = {
  article: WikiArticle;
  score: number;
  snippet: string;
};

export type WikiSearchOptions = {
  game?: string | null;
  limit?: number;
};

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

export async function searchWikiArticles(
  query: string,
  options?: WikiSearchOptions,
): Promise<WikiSearchResult[]> {
  const index = await getWikiKnowledgeIndex();
  if (!index.articles.length) return [];

  const queryWords = new Set(normalizeWords(query));
  if (queryWords.size === 0) return [];

  const gameFilter = options?.game?.toLowerCase() || null;
  const limit = options?.limit ?? 5;

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

    for (const section of article.sections) {
      const headingWords = normalizeWords(section.heading);
      const contentWords = normalizeWords(section.content);
      for (const word of queryWords) {
        if (headingWords.includes(word)) score += 20;
        if (contentWords.includes(word)) score += 5;
      }
    }

    if (score > 0) {
      const snippet =
        article.description ||
        article.sections[0]?.content.slice(0, 200) ||
        article.content.slice(0, 200);
      results.push({
        article,
        score,
        snippet: snippet.trim(),
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
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
