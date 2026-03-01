'use client'

import { useState } from 'react';
import { generateInviteLink } from './invite-actions';
import { Card, Title, Text, Button, Group, TextInput, Stack, CopyButton, ActionIcon, Tooltip } from '@mantine/core';
import { Check, Copy } from 'lucide-react';

export default function InviteGenerator() {
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setInviteUrl('');

    const res = await generateInviteLink();
    
    if (res?.error) {
      setError(res.error);
    } else if (res?.success && res.url) {
      setInviteUrl(res.url);
    }
    
    setLoading(false);
  }

  return (
    <Card withBorder radius="md" padding="xl" style={{ maxWidth: '42rem' }}>
      <Title order={3} mb="xs">Team Onboarding</Title>
      <Text size="sm" c="dimmed" mb="lg">
        Generate a unique, single-use invite link to onboard a new developer to the team. They will be prompted to create an account and their profile will be automatically set up.
      </Text>

      {!inviteUrl ? (
        <Button 
          onClick={handleGenerate}
          loading={loading}
        >
          Generate New Invite Link
        </Button>
      ) : (
        <Stack gap="md">
          <Group align="flex-end" gap="sm">
            <TextInput 
              readOnly 
              value={inviteUrl} 
              style={{ flex: 1 }}
              variant="filled"
            />
            <CopyButton value={inviteUrl} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="right">
                  <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy} size="lg">
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Text size="xs" c="yellow.7">
            * This link is single-use and will expire once a developer creates their account.
          </Text>
          <Button 
            variant="subtle" 
            onClick={() => setInviteUrl('')}
            style={{ alignSelf: 'flex-start' }}
          >
            Generate another
          </Button>
        </Stack>
      )}

      {error && <Text mt="md" size="sm" c="red" fw={500}>{error}</Text>}
    </Card>
  );
}