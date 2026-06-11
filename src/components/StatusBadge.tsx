import { Badge, type BadgeProps } from "@mantine/core";
import type { StatusCopy } from "@/lib/status-copy";

type StatusBadgeProps = Omit<BadgeProps, "color" | "children"> & {
  /** Resolved at the call site: `statusCopy(TRANSACTION_STATUS, tx.status)`. */
  copy: StatusCopy;
};

/**
 * Canonical status badge. Pair with the maps in src/lib/status-copy.ts:
 *
 *   <StatusBadge copy={statusCopy(WELCOME_PACK_ORDER_STATUS, order.status)} />
 */
export default function StatusBadge({ copy, ...rest }: StatusBadgeProps) {
  return (
    <Badge variant="light" {...rest} color={copy.color}>
      {copy.label}
    </Badge>
  );
}
