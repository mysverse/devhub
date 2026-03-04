"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDocumentTemplate, renderTemplate } from "@/lib/documents";
import prisma from "@/lib/prisma";

export async function signDocument(documentType: string) {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized" };

  const validTypes = ["COI", "NDA"];
  if (!validTypes.includes(documentType)) {
    return { error: "Invalid document type" };
  }

  try {
    const userProfile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { legalName: true },
    });

    if (!userProfile?.legalName) {
      return { error: "Legal name is required to sign documents. Please update your profile first." };
    }

    const template = getDocumentTemplate(documentType);
    const renderedContent = renderTemplate(template.content, {
      LEGAL_NAME: userProfile.legalName,
    });

    await prisma.signedDocument.upsert({
      where: {
        userId_documentType: {
          userId,
          documentType: documentType as "COI" | "NDA",
        },
      },
      create: {
        userId,
        documentType: documentType as "COI" | "NDA",
        templateVersion: template.meta.version,
        templateContent: renderedContent,
        legalName: userProfile.legalName,
      },
      update: {
        templateVersion: template.meta.version,
        templateContent: renderedContent,
        legalName: userProfile.legalName,
        signedAt: new Date(),
      },
    });

    revalidatePath("/dashboard/documents");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to sign document" };
  }
}

const CoiEntrySchema = z.object({
  organizationName: z.string().min(1, "Organization name is required"),
  natureOfInvolvement: z.string().min(1, "Nature of involvement is required"),
  description: z.string().min(1, "Description is required"),
});

export async function addCoiEntry(input: {
  organizationName: string;
  natureOfInvolvement: string;
  description: string;
}) {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized" };

  const parsed = CoiEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid input" };
  }

  try {
    const signedDoc = await prisma.signedDocument.findUnique({
      where: {
        userId_documentType: { userId, documentType: "COI" },
      },
    });

    if (!signedDoc) {
      return { error: "You must sign the COI declaration first." };
    }

    await prisma.coiEntry.create({
      data: {
        signedDocumentId: signedDoc.id,
        organizationName: parsed.data.organizationName,
        natureOfInvolvement: parsed.data.natureOfInvolvement,
        description: parsed.data.description,
      },
    });

    revalidatePath("/dashboard/documents");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to add entry" };
  }
}

export async function updateCoiEntry(input: {
  entryId: string;
  organizationName: string;
  natureOfInvolvement: string;
  description: string;
}) {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized" };

  const parsed = CoiEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid input" };
  }

  try {
    const entry = await prisma.coiEntry.findUnique({
      where: { id: input.entryId },
      include: { signedDocument: { select: { userId: true } } },
    });

    if (!entry || entry.signedDocument.userId !== userId) {
      return { error: "Entry not found" };
    }

    await prisma.coiEntry.update({
      where: { id: input.entryId },
      data: {
        organizationName: parsed.data.organizationName,
        natureOfInvolvement: parsed.data.natureOfInvolvement,
        description: parsed.data.description,
      },
    });

    revalidatePath("/dashboard/documents");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to update entry" };
  }
}

export async function removeCoiEntry(entryId: string) {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized" };

  try {
    const entry = await prisma.coiEntry.findUnique({
      where: { id: entryId },
      include: { signedDocument: { select: { userId: true } } },
    });

    if (!entry || entry.signedDocument.userId !== userId) {
      return { error: "Entry not found" };
    }

    await prisma.coiEntry.delete({ where: { id: entryId } });

    revalidatePath("/dashboard/documents");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to remove entry" };
  }
}
