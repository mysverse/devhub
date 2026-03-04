import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { createElement } from "react";

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.6,
  },
  h1: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
    marginTop: 8,
  },
  h2: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    marginTop: 16,
  },
  h3: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    marginTop: 12,
  },
  paragraph: {
    marginBottom: 8,
  },
  listItem: {
    flexDirection: "row" as const,
    marginBottom: 4,
    paddingLeft: 12,
  },
  bullet: {
    width: 12,
  },
  listItemText: {
    flex: 1,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
  signatureBlock: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#cccccc",
  },
  signatureLabel: {
    fontSize: 10,
    color: "#666666",
    marginBottom: 4,
  },
  signatureValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
  },
  coiTable: {
    marginTop: 20,
  },
  coiHeader: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  coiRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
    paddingVertical: 8,
    marginBottom: 4,
  },
  coiLabel: {
    fontSize: 9,
    color: "#666666",
  },
  coiValue: {
    fontSize: 11,
  },
});

function parseInlineFormatting(
  text: string,
): Array<{ text: string; bold: boolean }> {
  const parts: Array<{ text: string; bold: boolean }> = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  match = regex.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    parts.push({ text: match[1], bold: true });
    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), bold: false });
  }

  return parts.length > 0 ? parts : [{ text, bold: false }];
}

function renderTextWithFormatting(text: string) {
  const parts = parseInlineFormatting(text);
  if (parts.length === 1 && !parts[0].bold) {
    return createElement(Text, null, parts[0].text);
  }
  return createElement(
    Text,
    null,
    ...parts.map((part, i) =>
      part.bold
        ? createElement(Text, { key: i, style: styles.bold }, part.text)
        : createElement(Text, { key: i }, part.text),
    ),
  );
}

type CoiEntryPdf = {
  organizationName: string;
  natureOfInvolvement: string;
  description: string;
};

export function createDocumentPdf({
  title,
  version,
  content,
  legalName,
  signedAt,
  coiEntries,
}: {
  title: string;
  version: string;
  content: string;
  legalName: string;
  signedAt: Date;
  coiEntries?: CoiEntryPdf[];
}) {
  const lines = content.split("\n");
  const elements: React.ReactElement[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    if (!line) continue;

    if (line.startsWith("# ")) {
      elements.push(
        createElement(Text, { key: i, style: styles.h1 }, line.slice(2)),
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        createElement(Text, { key: i, style: styles.h2 }, line.slice(3)),
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        createElement(Text, { key: i, style: styles.h3 }, line.slice(4)),
      );
    } else if (line.startsWith("- ")) {
      const itemText = line.slice(2);
      elements.push(
        createElement(
          View,
          { key: i, style: styles.listItem },
          createElement(Text, { style: styles.bullet }, "\u2022 "),
          createElement(
            View,
            { style: styles.listItemText },
            renderTextWithFormatting(itemText),
          ),
        ),
      );
    } else {
      elements.push(
        createElement(
          View,
          { key: i, style: styles.paragraph },
          renderTextWithFormatting(line),
        ),
      );
    }
  }

  // COI entries section
  if (coiEntries && coiEntries.length > 0) {
    elements.push(
      createElement(
        View,
        { key: "coi-section", style: styles.coiTable },
        createElement(
          Text,
          { style: styles.coiHeader },
          "Declared Competing Commitments",
        ),
        ...coiEntries.map((entry, idx) =>
          createElement(
            View,
            { key: `coi-${idx}`, style: styles.coiRow },
            createElement(Text, { style: styles.coiLabel }, "Organization"),
            createElement(
              Text,
              { style: styles.coiValue },
              entry.organizationName,
            ),
            createElement(
              Text,
              { style: styles.coiLabel },
              "Nature of Involvement",
            ),
            createElement(
              Text,
              { style: styles.coiValue },
              entry.natureOfInvolvement,
            ),
            createElement(Text, { style: styles.coiLabel }, "Description"),
            createElement(Text, { style: styles.coiValue }, entry.description),
          ),
        ),
      ),
    );
  }

  // Signature block
  elements.push(
    createElement(
      View,
      { key: "signature", style: styles.signatureBlock },
      createElement(Text, { style: styles.signatureLabel }, "Signed by"),
      createElement(Text, { style: styles.signatureValue }, legalName),
      createElement(Text, { style: styles.signatureLabel }, "Date"),
      createElement(
        Text,
        { style: styles.signatureValue },
        signedAt.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      ),
      createElement(Text, { style: styles.signatureLabel }, "Method"),
      createElement(
        Text,
        { style: styles.signatureValue },
        "Electronically signed via DevHub",
      ),
      createElement(
        Text,
        { style: { fontSize: 9, color: "#999999", marginTop: 8 } },
        `Document: ${title} v${version}`,
      ),
    ),
  );

  return createElement(
    Document,
    null,
    createElement(Page, { size: "A4", style: styles.page }, ...elements),
  );
}
