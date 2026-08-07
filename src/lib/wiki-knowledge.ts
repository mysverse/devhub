import { readFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";
import { isDevMode } from "@/lib/dev-mode";

const WikiSectionSchema = z.object({
  heading: z.string(),
  summary: z.string().optional(),
  content: z.string().optional().default(""),
  systemTags: z.array(z.string()).optional(),
});

const WikiArticleSchema = z.object({
  slug: z.string(),
  game: z.string(),
  title: z.string(),
  description: z.string(),
  summary: z.string().optional(),
  canonicalUrl: z.string(),
  systemTags: z.array(z.string()).optional(),
  sections: z.array(WikiSectionSchema),
  content: z.string().optional(),
  tags: z.array(z.string()),
});

const WikiKnowledgeIndexSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  totalArticles: z.number(),
  articles: z.array(WikiArticleSchema),
});

export type WikiSection = z.infer<typeof WikiSectionSchema>;
export type WikiArticle = z.infer<typeof WikiArticleSchema>;
export type WikiKnowledgeIndex = z.infer<typeof WikiKnowledgeIndexSchema>;

const DEFAULT_WIKI_URL = "https://mys.wiki/knowledge-base.json";
const LOCAL_WIKI_PATH = path.resolve(
  process.cwd(),
  "../wiki/docs/public/knowledge-base.json",
);

let cachedIndex: WikiKnowledgeIndex | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function parseKnowledgeIndex(data: unknown): WikiKnowledgeIndex | null {
  const result = WikiKnowledgeIndexSchema.safeParse(data);
  if (!result.success) return null;
  return result.data;
}

export async function fetchRemoteKnowledgeIndex(): Promise<WikiKnowledgeIndex | null> {
  const url = process.env.WIKI_KNOWLEDGE_URL || DEFAULT_WIKI_URL;
  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return parseKnowledgeIndex(await response.json());
  } catch (_error) {
    return null;
  }
}

export async function readLocalKnowledgeIndex(): Promise<WikiKnowledgeIndex | null> {
  try {
    const raw = await readFile(LOCAL_WIKI_PATH, "utf8");
    return parseKnowledgeIndex(JSON.parse(raw));
  } catch {
    return null;
  }
}

const EMPTY_INDEX: WikiKnowledgeIndex = {
  version: "1.0",
  generatedAt: new Date().toISOString(),
  totalArticles: 0,
  articles: [],
};

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

  // 4. Cache the empty fallback to prevent stampede on repeated calls
  cachedIndex = EMPTY_INDEX;
  lastCacheTime = now;
  return EMPTY_INDEX;
}
