'use server'

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// In a real application, you should verify if the user has an ADMIN role in Clerk/Database.
async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  
  // For now, we will allow access for demonstration. 
  // You can implement role checks based on Clerk publicMetadata later.
  return userId;
}

export async function markTransactionAsPaid(transactionId: string) {
  await requireAdmin();

  try {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { 
        status: 'PAID',
        paidAt: new Date()
      }
    });

    revalidatePath('/dashboard/admin');
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to update transaction" };
  }
}
