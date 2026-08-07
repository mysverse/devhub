import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDevMode } from "@/lib/dev-mode";

export type WikiSection = {
  heading: string;
  content: string;
};

export type WikiArticle = {
  slug: string;
  game: "bandaraya" | "lebuhraya" | "sumaya" | "faq" | "general" | string;
  title: string;
  description: string;
  canonicalUrl: string;
  sections: WikiSection[];
  content: string;
  tags: string[];
};

export type WikiKnowledgeIndex = {
  version: string;
  generatedAt: string;
  totalArticles: number;
  articles: WikiArticle[];
};

const DEFAULT_WIKI_URL = "https://mys.wiki/knowledge-base.json";
const LOCAL_WIKI_PATH = path.resolve(
  process.cwd(),
  "../wiki/docs/public/knowledge-base.json",
);

let cachedIndex: WikiKnowledgeIndex | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function fetchRemoteKnowledgeIndex(): Promise<WikiKnowledgeIndex | null> {
  const url = process.env.WIKI_KNOWLEDGE_URL || DEFAULT_WIKI_URL;
  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as WikiKnowledgeIndex;
    if (data && Array.isArray(data.articles)) {
      return data;
    }
    return null;
  } catch (_error) {
    return null;
  }
}

export async function readLocalKnowledgeIndex(): Promise<WikiKnowledgeIndex | null> {
  try {
    const raw = await readFile(LOCAL_WIKI_PATH, "utf8");
    const data = JSON.parse(raw) as WikiKnowledgeIndex;
    if (data && Array.isArray(data.articles)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getWikiKnowledgeIndex(): Promise<WikiKnowledgeIndex> {
  const now = Date.now();
  if (cachedIndex && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedIndex;
  }

  // 1. Try local file first in dev mode / monorepo environment
  if (isDevMode() || process.env.NODE_ENV === "development") {
    const local = await readLocalKnowledgeIndex();
    if (local) {
      cachedIndex = local;
      lastCacheTime = now;
      return local;
    }
  }

  // 2. Try web / remote fetch
  const remote = await fetchRemoteKnowledgeIndex();
  if (remote) {
    cachedIndex = remote;
    lastCacheTime = now;
    return remote;
  }

  // 3. Fall back to local file if remote failed
  const localFallback = await readLocalKnowledgeIndex();
  if (localFallback) {
    cachedIndex = localFallback;
    lastCacheTime = now;
    return localFallback;
  }

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    totalArticles: 0,
    articles: [],
  };
}
