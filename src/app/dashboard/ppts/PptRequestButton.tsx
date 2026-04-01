"use client";

import { Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import PptRequestModal from "./PptRequestModal";

export default function PptRequestButton() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button onClick={open}>Request PPT</Button>
      <PptRequestModal opened={opened} onClose={close} />
    </>
  );
}
