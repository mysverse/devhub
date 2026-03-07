import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { createElement } from "react";
import { siteConfig } from "@/lib/config";

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.6,
  },
  header: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#333333",
  },
  brand: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#555555",
  },
  meta: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: 24,
  },
  metaText: {
    fontSize: 10,
    color: "#666666",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#888888",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row" as const,
    marginBottom: 4,
  },
  label: {
    width: 100,
    fontSize: 10,
    color: "#666666",
  },
  value: {
    flex: 1,
    fontSize: 11,
  },
  valueBold: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  amountSection: {
    marginTop: 8,
    paddingTop: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#eeeeee",
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
    alignItems: "center" as const,
  },
  amountLabel: {
    fontSize: 10,
    color: "#888888",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute" as const,
    bottom: 40,
    left: 50,
    right: 50,
    textAlign: "center" as const,
    fontSize: 9,
    color: "#999999",
  },
  statusPaid: { color: "#2b8a3e" },
  statusPending: { color: "#e67700" },
  statusCancelled: { color: "#c92a2a" },
});

export type TransactionSlipData = {
  transactionId: string;
  linearIssueIdentifier: string | null;
  linearIssueTitle: string | null;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "CANCELLED";
  createdAt: Date;
  paidAt: Date | null;
  legalName: string | null;
  paymentMethod: "PAYPAL" | "DUITNOW" | "ROBUX" | "BANK_TRANSFER";
  paypalEmail?: string | null;
  duitNowId?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  robuxUsername?: string | null;
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    PAYPAL: "PayPal",
    DUITNOW: "DuitNow",
    ROBUX: "Robux",
    BANK_TRANSFER: "Bank Transfer",
  };
  return map[method] || method;
}

function getPaymentDetails(data: TransactionSlipData): string {
  switch (data.paymentMethod) {
    case "PAYPAL":
      return data.paypalEmail || "Not set";
    case "ROBUX":
      return data.robuxUsername || "Not set";
    case "DUITNOW":
      return data.duitNowId
        ? `ID: ${data.duitNowId}`
        : data.bankAccountNumber
          ? `${data.bankName} - ${data.bankAccountNumber}`
          : "Not set";
    case "BANK_TRANSFER":
      return data.bankAccountNumber
        ? `${data.bankName} - ${data.bankAccountNumber} (${data.bankAccountName})`
        : "Not set";
    default:
      return "Not set";
  }
}

function statusStyle(status: string) {
  if (status === "PAID") return styles.statusPaid;
  if (status === "PENDING") return styles.statusPending;
  return styles.statusCancelled;
}

export function createTransactionSlipPdf(data: TransactionSlipData) {
  const slipId = data.transactionId.slice(-8).toUpperCase();
  const taskLabel = data.linearIssueTitle
    ? `${data.linearIssueTitle}${data.linearIssueIdentifier ? ` (${data.linearIssueIdentifier})` : ""}`
    : data.linearIssueIdentifier || "Manual Bonus";

  const amountStr =
    data.currency === "R$"
      ? `${data.amount.toFixed(2)} R$`
      : data.currency === "MYR"
        ? `RM${data.amount.toFixed(2)}`
        : `$${data.amount.toFixed(2)} ${data.currency}`;

  const detailRows: React.ReactElement[] = [
    createElement(
      View,
      { key: "task", style: styles.row },
      createElement(Text, { style: styles.label }, "Task"),
      createElement(Text, { style: styles.value }, taskLabel),
    ),
    createElement(
      View,
      { key: "status", style: styles.row },
      createElement(Text, { style: styles.label }, "Status"),
      createElement(
        Text,
        { style: { ...styles.valueBold, ...statusStyle(data.status) } },
        data.status,
      ),
    ),
    createElement(
      View,
      { key: "created", style: styles.row },
      createElement(Text, { style: styles.label }, "Created"),
      createElement(Text, { style: styles.value }, formatDate(data.createdAt)),
    ),
  ];

  if (data.paidAt) {
    detailRows.push(
      createElement(
        View,
        { key: "paid", style: styles.row },
        createElement(Text, { style: styles.label }, "Paid"),
        createElement(Text, { style: styles.value }, formatDate(data.paidAt)),
      ),
    );
  }

  const paymentRows: React.ReactElement[] = [
    createElement(
      View,
      { key: "dev", style: styles.row },
      createElement(Text, { style: styles.label }, "Developer"),
      createElement(Text, { style: styles.value }, data.legalName || "Not set"),
    ),
    createElement(
      View,
      { key: "method", style: styles.row },
      createElement(Text, { style: styles.label }, "Method"),
      createElement(
        Text,
        { style: styles.value },
        formatPaymentMethod(data.paymentMethod),
      ),
    ),
    createElement(
      View,
      { key: "account", style: styles.row },
      createElement(Text, { style: styles.label }, "Account"),
      createElement(Text, { style: styles.value }, getPaymentDetails(data)),
    ),
  ];

  return createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "A4", style: styles.page },
      // Header
      createElement(
        View,
        { style: styles.header },
        createElement(
          Text,
          { style: styles.brand },
          siteConfig.appName.toUpperCase(),
        ),
        createElement(Text, { style: styles.title }, "PAYMENT SLIP"),
      ),
      // Meta line
      createElement(
        View,
        { style: styles.meta },
        createElement(Text, { style: styles.metaText }, `Slip #${slipId}`),
        createElement(
          Text,
          { style: styles.metaText },
          `Generated: ${formatDate(new Date())}`,
        ),
      ),
      // Transaction Details
      createElement(
        View,
        { style: styles.section },
        createElement(
          Text,
          { style: styles.sectionTitle },
          "Transaction Details",
        ),
        ...detailRows,
      ),
      // Payment Details
      createElement(
        View,
        { style: styles.section },
        createElement(Text, { style: styles.sectionTitle }, "Payment Details"),
        ...paymentRows,
      ),
      // Amount
      createElement(
        View,
        { style: styles.amountSection },
        createElement(Text, { style: styles.amountLabel }, "Amount"),
        createElement(Text, { style: styles.amountValue }, amountStr),
      ),
      // Footer
      createElement(
        Text,
        { style: styles.footer },
        `Generated by ${siteConfig.appName}`,
      ),
    ),
  );
}
