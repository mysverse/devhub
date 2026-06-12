"use client";

import {
  ActionIcon,
  Menu,
  MenuDropdown,
  MenuTarget,
  Table,
  type TableProps,
  TableScrollContainer,
  TableTbody,
  TableThead,
} from "@mantine/core";
import { EllipsisVertical } from "lucide-react";

type TableShellProps = {
  /** Forwarded to TableScrollContainer — min width before horizontal scroll. */
  minWidth: number;
  /** <TableTr> of <TableTh> elements. */
  head: React.ReactNode;
  /** Body rows. */
  children: React.ReactNode;
} & Pick<
  TableProps,
  "striped" | "highlightOnHover" | "verticalSpacing" | "layout" | "mt"
>;

/**
 * Canonical admin data table: scroll container + table with consistent
 * hover/spacing defaults. Compose rows with the flat Mantine table
 * components (TableTr/TableTd) as usual.
 */
export function TableShell({
  minWidth,
  head,
  children,
  highlightOnHover = true,
  verticalSpacing = "sm",
  ...tableProps
}: TableShellProps) {
  return (
    <TableScrollContainer minWidth={minWidth}>
      <Table
        highlightOnHover={highlightOnHover}
        verticalSpacing={verticalSpacing}
        {...tableProps}
      >
        <TableThead>{head}</TableThead>
        <TableTbody>{children}</TableTbody>
      </Table>
    </TableScrollContainer>
  );
}

type RowActionsMenuProps = {
  /** Shows a spinner on the trigger while a row action is running. */
  loading?: boolean;
  width?: number;
  /** MenuItem / MenuLabel / MenuDivider elements. */
  children: React.ReactNode;
};

/**
 * Canonical row-actions kebab menu for table rows and list cards.
 */
export function RowActionsMenu({
  loading,
  width = 220,
  children,
}: RowActionsMenuProps) {
  return (
    <Menu shadow="md" width={width} position="bottom-end">
      <MenuTarget>
        <ActionIcon
          variant="subtle"
          color="gray"
          loading={loading}
          size="sm"
          aria-label="Row actions"
        >
          <EllipsisVertical size={16} />
        </ActionIcon>
      </MenuTarget>
      <MenuDropdown>{children}</MenuDropdown>
    </Menu>
  );
}
