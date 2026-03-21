"use client";

import { Button, type ButtonProps } from "@mantine/core";
import Link from "next/link";

export default function LinkButton({
  href,
  ...props
}: ButtonProps & { href: string }) {
  return <Button component={Link} href={href} {...props} />;
}
