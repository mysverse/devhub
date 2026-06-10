"use client";

import { Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import dynamic from "next/dynamic";

const PptRequestModal = dynamic(() => import("./PptRequestModal"), {
  ssr: false,
});

export default function PptRequestButton() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button onClick={open}>Request PPT</Button>
      {opened && <PptRequestModal opened={opened} onClose={close} />}
    </>
  );
}
