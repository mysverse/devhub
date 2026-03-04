import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getDocumentTemplate, renderTemplate } from "@/lib/documents";
import prisma from "@/lib/prisma";
import SigningForm from "./SigningForm";

type Params = Promise<{ type: string }>;

export default async function DocumentViewPage({ params }: { params: Params }) {
  const { type } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const docType = type.toUpperCase();
  const validTypes = ["COI", "NDA"];
  if (!validTypes.includes(docType)) {
    redirect("/dashboard/documents");
  }

  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { legalName: true },
  });

  if (!userProfile) redirect("/onboarding");

  const template = getDocumentTemplate(docType);
  const renderedContent = renderTemplate(template.content, {
    LEGAL_NAME: userProfile.legalName ?? "_______________",
  });

  const signedDocument = await prisma.signedDocument.findUnique({
    where: {
      userId_documentType: {
        userId,
        documentType: docType as "COI" | "NDA",
      },
    },
  });

  return (
    <SigningForm
      documentType={docType}
      title={template.meta.title}
      content={renderedContent}
      legalName={userProfile.legalName ?? null}
      signed={!!signedDocument}
      signedAt={signedDocument?.signedAt?.toISOString() ?? null}
      signedDocumentId={signedDocument?.id ?? null}
    />
  );
}
