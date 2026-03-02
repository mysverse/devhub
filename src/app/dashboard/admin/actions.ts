"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";

// In a real application, you should verify if the user has an ADMIN role in Clerk/Database.
async function requireAdmin() {
	const { userId } = await auth();
	if (!userId) throw new Error("Unauthorized");

	const userProfile = await prisma.userProfile.findUnique({
		where: { id: userId },
		select: { role: true },
	});

	if (!userProfile || userProfile.role !== "ADMIN") {
		throw new Error("Forbidden: Admin access required");
	}

	return userId;
}

export async function markTransactionAsPaid(transactionId: string) {
	await requireAdmin();

	try {
		await prisma.transaction.update({
			where: { id: transactionId },
			data: {
				status: "PAID",
				paidAt: new Date(),
			},
		});

		revalidatePath("/dashboard/admin");
		return { success: true };
	} catch (error) {
		const err = error as Error;
		return { error: err.message || "Failed to update transaction" };
	}
}
