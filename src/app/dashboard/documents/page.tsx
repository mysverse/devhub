import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { getSession } from "@/lib/auth-utils";
import { getAllDocumentTemplates } from "@/lib/documents";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import DocumentsClient from "./DocumentsClient";

export const metadata: Metadata = buildSocialMetadata("/dashboard/documents");

export default function DocumentsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Documents"
        subtitle="View and manage your legal agreements. All documents must be signed during onboarding."
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <DocumentsContent />
      </Suspense>
    </PageContainer>
  );
}

async function DocumentsContent() {
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
