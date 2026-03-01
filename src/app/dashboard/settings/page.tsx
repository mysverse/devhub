import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import SettingsForm from "./SettingsForm";
import InviteGenerator from "./InviteGenerator";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
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

        <Divider my="md" />
        
        {/* 
          In a production environment, you might want to wrap InviteGenerator 
          in a check like `if (userProfile.role === 'ADMIN')` to restrict who can generate invites. 
        */}
        <StaggerItem>
          <InviteGenerator />
        </StaggerItem>
      </Box>
    </StaggerContainer>
  );
}