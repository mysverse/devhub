import { auth } from "@clerk/nextjs/server";
import { Box, Divider, Text, Title } from "@mantine/core";
import { redirect } from "next/navigation";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import prisma from "@/lib/prisma";
import InviteGenerator from "./InviteGenerator";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
  });

  if (!userProfile) {
    redirect("/dashboard");
  }

  return (
    <StaggerContainer>
      <Box style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <StaggerItem>
          <Title order={1}>HR Settings</Title>
          <Text c="dimmed" mt="xs">
            Manage your personal information and payment preferences to receive
            your payouts.
          </Text>
        </StaggerItem>

        <StaggerItem>
          <SettingsForm profile={userProfile} />
        </StaggerItem>

        {userProfile.role === "ADMIN" && (
          <>
            <Divider my="md" />
            <StaggerItem>
              <InviteGenerator />
            </StaggerItem>
          </>
        )}
      </Box>
    </StaggerContainer>
  );
}
