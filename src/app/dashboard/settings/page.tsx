import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import SettingsForm from "./SettingsForm";
import InviteGenerator from "./InviteGenerator";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import { Title, Text, Divider, Box } from "@mantine/core";

export default async function SettingsPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/");
  }

  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId }
  });

  if (!userProfile) {
    redirect("/dashboard");
  }

  return (
    <StaggerContainer>
      <Box style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <StaggerItem>
          <Title order={1}>HR Settings</Title>
          <Text c="dimmed" mt="xs">
            Manage your personal information and payment preferences to receive your payouts.
          </Text>
        </StaggerItem>

        <StaggerItem>
          <SettingsForm profile={userProfile} />
        </StaggerItem>

        {userProfile.role === 'ADMIN' && (
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