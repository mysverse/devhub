/**
 * Assistant browser contract. Requires `pnpm dev:mock`. A fresh mock database
 * keeps rate-limit rows deterministic when this is run repeatedly.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { chromium, type Locator, type Page } from "playwright";

config({ path: ".env.mock", override: true, quiet: true });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function waitForText(locator: Locator, timeout = 20_000) {
  await locator.waitFor({ state: "visible", timeout });
}

async function newChat(page: Page) {
  await page.getByRole("button", { name: "Recent chats" }).click();
  await page.getByRole("menuitem", { name: "New chat" }).click();
  await page
    .getByRole("textbox", { name: "Message DevHub Assistant" })
    .waitFor({ state: "visible" });
}

async function send(page: Page, message: string) {
  const composer = page.getByRole("textbox", {
    name: "Message DevHub Assistant",
  });
  await composer.fill(message);
  await composer.press("Enter");
}

async function assertChatBounds(page: Page, viewportWidth: number) {
  const dialog = page.getByRole("dialog", { name: "DevHub Assistant" });
  const audit = await dialog.evaluate((root) => {
    const box = root.getBoundingClientRect();
    const shell = root.firstElementChild?.getBoundingClientRect();
    const outside = [...root.querySelectorAll("button, textarea, input")]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.left < box.left - 1 ||
          rect.right > box.right + 1 ||
          rect.top < box.top - 1 ||
          rect.bottom > box.bottom + 1
        );
      })
      .map(
        (node) =>
          node.getAttribute("aria-label") ||
          node.textContent?.trim().slice(0, 40) ||
          node.tagName,
      );
    return {
      outside,
      panelOverflow: root.scrollHeight - root.clientHeight,
      shellGap: shell
        ? Math.abs(box.bottom - shell.bottom)
        : Number.POSITIVE_INFINITY,
      left: box.left,
      right: box.right,
    };
  });
  assert.deepEqual(audit.outside, []);
  assert.ok(
    audit.panelOverflow <= 1,
    "The assistant panel itself must not scroll",
  );
  assert.ok(
    audit.shellGap <= 1,
    "The chat shell must fill the assistant panel",
  );
  assert.ok(audit.left >= -1 && audit.right <= viewportWidth + 1);
}

async function assertManualScrollHolds(page: Page) {
  const dialog = page.getByRole("dialog", { name: "DevHub Assistant" });
  const viewport = dialog.locator(".mantine-ScrollArea-viewport").first();
  const canScroll = await viewport.evaluate(
    (element) => element.scrollHeight - element.clientHeight > 20,
  );
  if (!canScroll) return;
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  const composer = page.getByRole("textbox", {
    name: "Message DevHub Assistant",
  });
  await composer.fill("Keep my place");
  await page.waitForTimeout(100);
  const scrollTop = await viewport.evaluate((element) => element.scrollTop);
  assert.ok(scrollTop < 5, "Typing must not yank a reader back to the bottom");
  await composer.fill("");
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(`${BASE_URL}/api/dev/login?as=admin`, {
      waitUntil: "load",
      timeout: 60_000,
    });
    await page.goto(`${BASE_URL}/dashboard`, {
      waitUntil: "load",
      timeout: 60_000,
    });
    // The dashboard layout persists session state across pages. This round trip
    // catches server/client greeting drift that a single page load misses.
    await page.goto(`${BASE_URL}/dashboard/ppts`, {
      waitUntil: "load",
      timeout: 60_000,
    });
    await page.goto(`${BASE_URL}/dashboard`, {
      waitUntil: "load",
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "Open DevHub Assistant" }).click();
    await page
      .getByRole("dialog", { name: "DevHub Assistant" })
      .waitFor({ state: "visible" });

    await newChat(page);
    await send(page, "What tasks am I currently assigned?");
    await waitForText(page.getByText("1 check used"));
    await page.getByText("1 check used").click();
    await waitForText(page.getByText("Active tasks ready"));

    await newChat(page);
    await send(page, "Prepare an ordinary task for a spawn audit");
    await waitForText(
      page.getByText("Create ordinary Linear issue: Audit spawn points"),
    );
    await waitForText(page.getByRole("button", { name: "Confirm" }));
    await assertManualScrollHolds(page);

    await newChat(page);
    await send(page, "Test fallback");
    await waitForText(page.getByText("Backup used"));
    await page.getByText("Backup used").click();
    await waitForText(
      page.getByText("Primary assistant paused. Backup took over."),
    );
    await waitForText(page.getByText(/switched to the backup/i));

    await newChat(page);
    await send(page, "Explain the task flow with a diagram");
    await page
      .getByRole("img", { name: "Assistant diagram" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await assertChatBounds(page, 1280);
    fs.mkdirSync(path.join(process.cwd(), "screenshots"), { recursive: true });
    await page.screenshot({
      path: path.join(
        process.cwd(),
        "screenshots",
        "assistant-overlay-desktop-e2e.png",
      ),
    });

    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = page.getByRole("dialog", { name: "DevHub Assistant" });
    const box = await dialog.boundingBox();
    assert.ok(box, "Assistant dialog should remain visible at mobile width");
    assert.ok(
      box.width <= 390,
      `Assistant dialog overflows mobile by ${box.width - 390}px`,
    );
    await assertChatBounds(page, 390);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    assert.ok(overflow <= 1, `Page overflows horizontally by ${overflow}px`);

    await page.screenshot({
      path: path.join(
        process.cwd(),
        "screenshots",
        "assistant-overlay-mobile-e2e.png",
      ),
    });
    assert.deepEqual(pageErrors, []);
    console.log("✓ read tool activity");
    console.log("✓ multi-round action proposal");
    console.log("✓ OpenAI 400 → Anthropic streamed fallback");
    console.log("✓ Mermaid response rendering");
    console.log("✓ mobile overlay bounds");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
