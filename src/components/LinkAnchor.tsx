"use client";

import { Anchor, type AnchorProps } from "@mantine/core";
import Link from "next/link";

export default function LinkAnchor({
  href,
  ...props
}: AnchorProps & { href: string; children?: React.ReactNode }) {
  return <Anchor component={Link} href={href} {...props} />;
}
