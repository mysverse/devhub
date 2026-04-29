/**
 * ISO 3166-1 alpha-2 → human readable country name. Falls back to the code
 * if the runtime doesn't recognise it (e.g., custom values).
 */
export function countryNameFromCode(code: string | null | undefined): string {
  if (!code) return "";
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    return display.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
