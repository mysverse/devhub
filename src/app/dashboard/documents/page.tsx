import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-utils";
import { getAllDocumentTemplates } from "@/lib/documents";
import prisma from "@/lib/prisma";
import DocumentsClient from "./DocumentsClient";

export default async function DocumentsPage() {
  const { userId } = await getSession();
  if (!userId) redirect("/sign-in");

  const signedDocuments = await prisma.signedDocument.findMany({
    where: { userId },
    include: { coiEntries: { orderBy: { createdAt: "desc" } } },
  });

  const templates = getAllDocumentTemplates();

  const documents = templates.map(({ type, meta }) => {
    const signed = signedDocuments.find((d) => d.documentType === type);
    return {
      type,
      title: meta.title,
      signed: !!signed,
      signedAt: signed?.signedAt?.toISOString() ?? null,
      signedDocumentId: signed?.id ?? null,
      coiEntries:
        type === "COI" && signed
          ? signed.coiEntries.map((e) => ({
              id: e.id,
              organizationName: e.organizationName,
              natureOfInvolvement: e.natureOfInvolvement,
              description: e.description,
            }))
          : [],
    };
  });

  return <DocumentsClient documents={documents} />;
}
