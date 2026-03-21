import {
  Document,
  G,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { createElement } from "react";
import { siteConfig } from "@/lib/config";

const LOGO_PATHS = [
  "M1762.433,97.406l146.473,0l0,191.509l-619.882,0l0,-191.509l47.962,-0l0,163.032l50.696,0l0,-78.613c10.497,-3.127 20.323,-4.69 31.043,-4.69l1.117,0c21.886,0 28.586,6.7 28.586,30.373l0,52.93l50.92,0l0,-69.679c0,-40.646 -15.857,-56.949 -53.823,-56.949l-1.563,0c-10.273,0 -24.343,0.67 -31.713,2.01l-24.566,15.633l0,-54.046l324.054,0l0,158.342c21.216,3.573 52.483,6.7 73.476,6.7l11.613,0c62.086,0 79.059,-14.963 79.059,-56.726l0,-14.963c0,-39.083 -16.303,-56.949 -55.386,-56.949l-1.563,0c-9.827,0 -23.896,0.67 -31.713,2.01l-24.79,15.857l0,-54.27Zm-128.415,116.579c-10.273,3.127 -19.876,4.69 -30.596,4.69l-0.893,0c-21.44,0 -28.363,-6.7 -28.363,-30.373l0,-52.93l-50.696,0l0,69.679c0,40.646 15.633,56.949 53.153,56.949l1.563,0c10.497,0 23.896,-0.67 31.49,-2.01l24.343,-15.633l0,16.08l50.92,0l0,-125.066l-50.92,0l0,78.613Zm190.948,-9.603c0,15.187 -6.923,19.653 -31.713,19.653c-9.603,0 -20.1,-0.67 -30.82,-2.457l0,-39.083c11.39,-3.35 22.556,-5.36 34.17,-5.36l0.893,0c20.1,0 27.47,4.243 27.47,21.216l0,6.03Z",
  "M0,182.368l54.12,201.988l-54.12,0l0,-201.988",
  "M201.988,0l-201.988,54.12l0,-54.12l201.988,0",
  "M298.216,8.519l-289.696,77.62l77.62,289.696l289.696,-77.62l-77.62,-289.696m-229.048,85.718l129.125,103.01c0,0 6.377,3.846 2.649,9.852c-0.236,0.371 -0.472,0.725 -0.725,1.029c-0.051,0.067 -0.101,0.118 -0.135,0.169c-0.084,0.101 -0.152,0.186 -0.236,0.27c-0.118,0.135 -0.236,0.253 -0.337,0.388c-0.084,0.084 -0.169,0.152 -0.253,0.236c-0.067,0.067 -0.135,0.118 -0.202,0.186c-0.034,0.034 -0.084,0.067 -0.118,0.101c-0.067,0.067 -0.135,0.118 -0.202,0.186c-0.084,0.051 -0.152,0.118 -0.219,0.169c-0.051,0.034 -0.118,0.084 -0.169,0.118c-0.084,0.051 -0.169,0.101 -0.236,0.152c-0.101,0.067 -0.202,0.118 -0.304,0.169c-0.084,0.051 -0.202,0.118 -0.287,0.152c-0.034,0 -0.051,0.017 -0.084,0.034c-0.067,0.034 -0.152,0.067 -0.219,0.101l-0.034,0c-0.084,0.034 -0.186,0.084 -0.27,0.118c-0.101,0.034 -0.186,0.067 -0.304,0.101c-0.084,0.034 -0.186,0.051 -0.287,0.084c-1.653,0.439 -3.205,0.152 -4.302,-0.236c-0.118,-0.051 -0.253,-0.101 -0.371,-0.135c-0.759,-0.304 -1.215,-0.59 -1.215,-0.59l-152.204,-107.379l30.923,-8.283l0.017,0Zm228.154,136.464l-0.978,64.461l-64.208,0.742l-19.198,-26.419l-3.442,32.678l-56.313,31.379l-32.745,-55.25l13.429,-30.147l-29.354,4.656l-44.892,-46.275l44.892,-45.938l43.981,29.928l-15.234,15.588l20.615,21.24l13.479,-2.143l-6.158,13.85l15.031,25.356l25.862,-14.407l1.569,-14.998l8.823,12.13l29.489,-0.337l0.455,-29.607l-12.18,-8.857l12.653,-4.859l7.305,-28.561l-28.477,-8.098l-14.289,11.573l-1.94,-18.355l-25.693,-14.441l-10.611,17.748l-41.332,-33.251l33.083,-55.334l55.976,31.463l4.201,39.999l31.143,-25.221l61.998,17.629l-15.909,62.218l-27.549,10.561l26.537,19.283l-0.017,0.017Z",
  "M384.355,0l0,201.988l-54.12,-201.988l54.12,0",
  "M182.368,384.355l201.988,-54.12l0,54.12l-201.988,0",
  "M529.355,150.796l0,-53.39l137.866,0c72.832,0 111.714,20.021 111.714,80.956l0,29.597c0,51.649 -26.115,80.956 -113.745,80.956l-123.61,0l0,-118.09l68.479,0l0,64.7l53.39,0c33.079,0 47.007,-8.995 47.007,-34.24l0,-16.249c0,-25.244 -13.928,-34.24 -47.007,-34.24l-134.094,0Z",
  "M798.376,97.406l0,191.509l187.157,0l0,-51.359l-118.678,0l0,-20.892l102.719,0l0,-47.877l-102.719,0l0,-20.021l118.678,0l0,-51.359l-187.157,0Z",
  "M1175.011,288.915l68.479,-191.509l-71.381,0l-44.976,137.248l-12.477,0l-46.717,-137.248l-71.091,0l68.769,191.509l109.392,0Z",
];

function createPdfLogo() {
  return createElement(
    Svg,
    { viewBox: "0 0 1909 385", style: styles.brand },
    createElement(
      G,
      { fill: "#000000" },
      ...LOGO_PATHS.map((d, i) => createElement(Path, { key: i, d })),
    ),
  );
}

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
    height: 28,
    width: 140,
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
    data.currency === "ROBUX"
      ? `${data.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} Robux`
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
        createPdfLogo(),
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
