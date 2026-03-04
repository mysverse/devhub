import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type DocumentMeta = {
  title: string;
  version: string;
  type: string;
};

export type DocumentTemplate = {
  meta: DocumentMeta;
  content: string;
};

const DOCUMENT_FILES: Record<string, string> = {
  COI: "coi.md",
  NDA: "nda.md",
};

export const REQUIRED_DOCUMENTS = ["COI", "NDA"] as const;

export function getDocumentTemplate(type: string): DocumentTemplate {
  const fileName = DOCUMENT_FILES[type];
  if (!fileName) {
    throw new Error(`Unknown document type: ${type}`);
  }
  const filePath = path.join(process.cwd(), "src", "documents", fileName);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  return { meta: data as DocumentMeta, content: content.trim() };
}

export function renderTemplate(
  content: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    content,
  );
}

export function getAllDocumentTemplates(): Array<{
  type: string;
  meta: DocumentMeta;
}> {
  return REQUIRED_DOCUMENTS.map((type) => ({
    type,
    meta: getDocumentTemplate(type).meta,
  }));
}
