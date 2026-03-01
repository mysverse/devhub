'use client'

import { useState } from 'react';
import { generateInviteLink } from './invite-actions';
import { Card, Title, Text, Button, Group, TextInput, Stack, CopyButton, ActionIcon, Tooltip } from '@mantine/core';
import { Check, Copy } from 'lucide-react';

export default function InviteGenerator() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError('');
    setSuccessMessage('');
    setInviteUrl('');

    const res = await generateInviteLink(email);
    
    if (res?.error) {
      setError(res.error);
    } else if (res?.success && res.url) {
      setInviteUrl(res.url);
      setSuccessMessage(res.message || 'Invite sent!');
    }
    
    setLoading(false);
  }

  return (
    <Card withBorder radius="md" padding="xl" style={{ maxWidth: '42rem' }}>
      <Title order={3} mb="xs">Team Onboarding</Title>
      <Text size="sm" c="dimmed" mb="lg">
        Invite a new developer to the team. This will allow them to bypass the closed registration page and automatically create their account.
      </Text>

      {!inviteUrl ? (
        <form onSubmit={handleGenerate}>
          <Group align="flex-end">
            <TextInput
              label="Developer's Email"
              placeholder="name@example.com"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button 
              type="submit"
              loading={loading}
            >
              Send Invite
            </Button>
          </Group>
        </form>
      ) : (
        <Stack gap="md">
          <Text size="sm" c="green" fw={500}>{successMessage}</Text>
          <Group align="flex-end" gap="sm">
            <TextInput 
              label="Direct Invite Link"
              readOnly 
              value={inviteUrl} 
              style={{ flex: 1 }}
              variant="filled"
            />
            <CopyButton value={inviteUrl} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="right">
                  <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy} size="lg" mb={4}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Text size="xs" c="yellow.7">
            * Clerk has sent them an email, but you can also share this link manually.
          </Text>
          <Button 
            variant="subtle" 
            onClick={() => {
              setInviteUrl('');
              setEmail('');
            }}
            style={{ alignSelf: 'flex-start' }}
          >
            Invite another developer
          </Button>
        </Stack>
      )}

      {error && <Text mt="md" size="sm" c="red" fw={500}>{error}</Text>}
    </Card>
  );
}