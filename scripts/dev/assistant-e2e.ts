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
const PERSONA =
  process.env.ASSISTANT_E2E_PERSONA === "admin" ? "admin" : "developer";

async function waitForText(locator: Locator, timeout = 20_000) {
  await locator.waitFor({ state: "visible", timeout });
}

async function newChat(page: Page) {
  await page.getByRole("button", { name: "New chat" }).click();
  await page
    .getByRole("button", { name: "Shape an idea" })
    .waitFor({ state: "visible" });
  await page
    .getByRole("textbox", { name: "Message DevHub Assistant" })
    .waitFor({ state: "visible" });
}

async function assertRecentChatsUsable(page: Page) {
  await page.getByRole("button", { name: "Recent chats" }).click();
  const menu = page.getByRole("menu");
  await menu.waitFor({ state: "visible" });
  const audit = await menu.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const topmost = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + Math.min(box.height / 2, 40),
    );
    return {
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      left: box.left,
      topmost: Boolean(topmost && element.contains(topmost)),
    };
  });
  assert.ok(audit.top >= 0 && audit.left >= 0);
  assert.ok(audit.right <= (await page.evaluate(() => window.innerWidth)) + 1);
  assert.ok(
    audit.bottom <= (await page.evaluate(() => window.innerHeight)) + 1,
  );
  assert.ok(audit.topmost, "Recent chats must render above the overlay");
  await page.keyboard.press("Escape");
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
    const messageViewport = root.querySelector(".mantine-ScrollArea-viewport");
    const outside = [...root.querySelectorAll("button, textarea, input")]
      .filter((node) => {
        if (node.closest(".mantine-ScrollArea-viewport")) return false;
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
      messageHorizontalOverflow: messageViewport
        ? messageViewport.scrollWidth - messageViewport.clientWidth
        : Number.POSITIVE_INFINITY,
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
    audit.messageHorizontalOverflow <= 1,
    "Messages must not overflow horizontally",
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
    await page.goto(`${BASE_URL}/api/dev/login?as=${PERSONA}`, {
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
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="suggested-ppts"]').length ===
        1,
      undefined,
      { timeout: 10_000 },
    );
    const suggestedPpts = page.getByTestId("suggested-ppts");
    await suggestedPpts.waitFor({ state: "visible", timeout: 30_000 });
    await waitForText(suggestedPpts.getByText("3x", { exact: true }).first());
    const suggestedPayout = suggestedPpts.getByTestId("ppt-payout").first();
    await suggestedPayout.waitFor({ state: "visible" });
    assert.match((await suggestedPayout.textContent()) ?? "", /^RM[\d,.]+$/);
    await suggestedPayout.scrollIntoViewIfNeeded();
    fs.mkdirSync(path.join(process.cwd(), "screenshots"), { recursive: true });
    await suggestedPpts.screenshot({
      path: path.join(
        process.cwd(),
        "screenshots",
        "suggested-ppts-campaign-desktop.png",
      ),
    });
    await page.getByRole("button", { name: "Open DevHub Assistant" }).click();
    const assistantDialog = page.getByRole("dialog", {
      name: "DevHub Assistant",
    });
    await assistantDialog.waitFor({ state: "visible" });
    await waitForText(page.getByRole("button", { name: "New chat" }));
    await assertRecentChatsUsable(page);

    await newChat(page);
    await page.getByRole("button", { name: "Show open PPTs" }).click();
    const openPptReference = assistantDialog
      .getByTestId("linear-task-reference")
      .first();
    await openPptReference.waitFor({ state: "visible", timeout: 30_000 });
    await waitForText(
      openPptReference.getByText("Projected payout", { exact: true }),
    );
    await waitForText(openPptReference.getByText("3x", { exact: true }));
    assert.match(
      (await openPptReference
        .getByTestId("linear-task-payout")
        .textContent()) ?? "",
      /^RM[\d,.]+$/,
    );
    await page.screenshot({
      path: path.join(
        process.cwd(),
        "screenshots",
        "assistant-open-ppts-desktop.png",
      ),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openPptReference
      .getByTestId("linear-task-payout")
      .scrollIntoViewIfNeeded();
    await assertChatBounds(page, 390);
    await page.screenshot({
      path: path.join(
        process.cwd(),
        "screenshots",
        "assistant-open-ppts-mobile.png",
      ),
    });
    await page.setViewportSize({ width: 1280, height: 850 });

    await newChat(page);
    await send(page, "Find task MYS-201");
    await waitForText(page.getByText("1 check used"));
    await page.getByText("1 check used").click();
    await waitForText(page.getByText("Task search ready"));
    await waitForText(
      page.getByRole("link", { name: "Open MYS-201 in Linear" }),
    );
    await page.screenshot({
      path: path.join(
        process.cwd(),
        "screenshots",
        "assistant-linear-references-desktop.png",
      ),
    });
    await page.reload({ waitUntil: "load" });
    await page.getByRole("button", { name: "Open DevHub Assistant" }).click();
    await waitForText(
      page.getByRole("link", { name: "Open MYS-201 in Linear" }),
    );

    await newChat(page);
    await send(page, "Prepare an ordinary task for a spawn audit");
    await waitForText(
      page.getByText("Create ordinary Linear issue: Audit spawn points"),
    );
    // The confirm button is labelled per action kind (actionCtaLabel), not
    // "Confirm" — asserting the generic word passed only until the copy
    // improved, and then failed for the best possible reason.
    await waitForText(page.getByRole("button", { name: "Create Linear task" }));
    await assertManualScrollHolds(page);

    await newChat(page);
    await page.getByRole("button", { name: "Shape an idea" }).click();
    const composer = page.getByRole("textbox", {
      name: "Message DevHub Assistant",
    });
    assert.equal(await composer.inputValue(), "I want to build ");
    await composer.fill(
      "I want to make a realistic Proton X90-inspired civilian car for Lebuhraya in Roblox, with a basic interior",
    );
    await composer.press("Enter");
    await waitForText(page.getByText("Working draft"));
    await page.getByRole("button", { name: "Make this a PPT" }).click();
    await waitForText(page.getByText(/due date \+ estimate/i));
    await send(page, "End of this month, estimate 3. Test fallback");
    await waitForText(
      page.getByText(
        "Submit PPT request: Create a realistic Proton X90-inspired civilian car",
      ),
    );
    await waitForText(
      assistantDialog.getByText("Projected payout", { exact: true }),
    );
    await waitForText(assistantDialog.getByText("RM180.00", { exact: true }));
    await waitForText(
      page.getByRole("button", { name: "Submit PPT request" }),
    );
    await waitForText(page.getByText("2 checks used"));
    await page.getByText("2 checks used").click();
    await waitForText(
      page.getByText("Primary assistant paused. Backup took over."),
    );
    await waitForText(page.getByText("Project destination ready"));
    await waitForText(page.getByText(/backup finished the job/i));
    await assistantDialog
      .getByText("Projected payout", { exact: true })
      .scrollIntoViewIfNeeded();
    await assertChatBounds(page, 1280);
    await page.screenshot({
      path: path.join(
        process.cwd(),
        "screenshots",
        "assistant-idea-to-ppt-desktop.png",
      ),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await assistantDialog
      .getByText("Projected payout", { exact: true })
      .scrollIntoViewIfNeeded();
    await assertChatBounds(page, 390);
    await page.screenshot({
      path: path.join(
        process.cwd(),
        "screenshots",
        "assistant-idea-to-ppt-mobile.png",
      ),
    });
    await page.setViewportSize({ width: 1280, height: 850 });

    await newChat(page);
    await send(page, "Explain the task flow with a diagram");
    await page
      .getByRole("img", { name: "Assistant diagram" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await assertChatBounds(page, 1280);
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
    await waitForText(page.getByRole("button", { name: "New chat" }));
    await assertRecentChatsUsable(page);
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
    console.log("✓ rich Linear task references");
    console.log("✓ open PPT references show campaign-aware payouts");
    console.log("✓ campaign-aware suggested PPT cards");
    console.log("✓ multi-round action proposal");
    console.log("✓ rough idea → PPT in three user turns");
    console.log("✓ campaign-aware assistant payout preview");
    console.log("✓ OpenAI 400 → Anthropic tool/action fallback");
    console.log("✓ Mermaid response rendering");
    console.log("✓ recent/new chat controls on desktop and mobile");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
