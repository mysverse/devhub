import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { FadeIn } from "@/components/animations";
import { Container, Card, Title, Text, Button, Center, ThemeIcon, Stack, Anchor } from "@mantine/core";
import { Mail, AlertCircle, CheckCircle } from "lucide-react";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { userId } = await auth();
  const token = (await searchParams).token;

  if (!token || typeof token !== 'string') {
    return (
      <Center h="100vh" bg="var(--mantine-color-body)">
        <FadeIn>
          <Card withBorder radius="md" padding="xl" w={400} ta="center">
            <ThemeIcon size="xl" radius="md" color="red" variant="light" mb="md" mx="auto">
              <AlertCircle size={24} />
            </ThemeIcon>
            <Title order={3} c="red" mb="xs">Invalid Invite Link</Title>
            <Text c="dimmed" size="sm">This invite link is missing or malformed. Please contact the person who invited you.</Text>
          </Card>
        </FadeIn>
      </Center>
    );
  }

  // Validate the token
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { creator: true }
  });

  if (!invite) {
    return (
      <Center h="100vh" bg="var(--mantine-color-body)">
        <FadeIn>
          <Card withBorder radius="md" padding="xl" w={400} ta="center">
            <ThemeIcon size="xl" radius="md" color="red" variant="light" mb="md" mx="auto">
              <AlertCircle size={24} />
            </ThemeIcon>
            <Title order={3} c="red" mb="xs">Invite Not Found</Title>
            <Text c="dimmed" size="sm">We couldn't find an active invite for this link. It may have been deleted.</Text>
          </Card>
        </FadeIn>
      </Center>
    );
  }

  if (invite.used) {
    return (
      <Center h="100vh" bg="var(--mantine-color-body)">
        <FadeIn>
          <Card withBorder radius="md" padding="xl" w={400} ta="center">
            <ThemeIcon size="xl" radius="md" color="yellow" variant="light" mb="md" mx="auto">
              <CheckCircle size={24} />
            </ThemeIcon>
            <Title order={3} c="yellow.7" mb="xs">Invite Already Used</Title>
            <Text c="dimmed" size="sm">This invite link has already been claimed.</Text>
          </Card>
        </FadeIn>
      </Center>
    );
  }

  // If user is already logged in, process the invite
  if (userId) {
    const user = await currentUser();
    
    // Ensure profile exists
    let userProfile = await prisma.userProfile.findUnique({ where: { id: userId } });
    if (!userProfile) {
      userProfile = await prisma.userProfile.create({
        data: {
          id: userId,
          legalName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : null,
        }
      });
    }

    // Mark as used
    await prisma.invite.update({
      where: { id: invite.id },
      data: { 
        used: true,
        usedById: userId
      }
    });

    // We can also trigger Linear/Discord invites here later if needed

    redirect("/dashboard");
  }

  // If not logged in, prompt them to sign up
  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <FadeIn>
        <Card withBorder radius="md" padding="xl" w={400} ta="center">
          <ThemeIcon size={64} radius="xl" color="blue" variant="light" mb="lg" mx="auto">
            <Mail size={32} />
          </ThemeIcon>
          <Title order={3} mb="xs">You've been invited!</Title>
          <Text c="dimmed" size="sm" mb="xl">
            {invite.creator?.legalName ? `${invite.creator.legalName} has` : 'You have been'} invited to join the DevHub PPT Platform.
          </Text>

          <Stack gap="md">
            <Button size="md" component={Link} href={`/sign-up?redirect_url=/invite?token=${token}`}>
              Accept Invite & Sign Up
            </Button>
            <Text size="sm" c="dimmed">
              Already have an account?{' '}
              <Anchor fw={500} component={Link} href={`/sign-in?redirect_url=/invite?token=${token}`}>
                Log in
              </Anchor>
            </Text>
          </Stack>
        </Card>
      </FadeIn>
    </Center>
  );
}