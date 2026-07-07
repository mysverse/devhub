export const PPT_PROGRESS_TEMPLATE = `Progress update

What changed:

Current blocker:

Next step:`;

const TEMPLATE_LABELS = [
  "progress update",
  "what changed:",
  "current blocker:",
  "next step:",
];

export function hasMeaningfulPptProgress(body: string) {
  const content = TEMPLATE_LABELS.reduce(
    (remaining, label) => remaining.replaceAll(new RegExp(label, "gi"), ""),
    body,
  )
    .replaceAll(/\s+/g, " ")
    .trim();
  return content.length >= 10;
}
