"use client";

import { Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import dynamic from "next/dynamic";
import type { CampaignBadgeInfo } from "@/lib/payout-campaign";

const PptRequestModal = dynamic(() => import("./PptRequestModal"), {
  ssr: false,
});

export default function PptRequestButton({
  campaign = null,
}: {
  /** Live PPT campaign with no label restriction; resolved server-side. */
  campaign?: CampaignBadgeInfo | null;
}) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button onClick={open}>Request PPT</Button>
      {opened && (
        <PptRequestModal opened={opened} onClose={close} campaign={campaign} />
      )}
    </>
  );
}
