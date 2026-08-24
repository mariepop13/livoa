import { expect, test, type Page } from "@playwright/test";

async function createCharacter(page: Page): Promise<void> {
  await page.goto("/characters");
  await page.getByLabel("Name").fill("Mira Vale");
  await page
    .getByLabel("Description")
    .fill("A calm cartographer who turns uncertainty into a route forward.");
  await page
    .getByLabel("Personality")
    .fill("Observant, grounded, and quietly witty.");
  await page
    .getByLabel("System prompt")
    .fill("You are Mira Vale, a thoughtful guide who gives clear answers.");
  await page.getByLabel("Greeting (optional)").fill("Where should we begin?");
  await page.getByRole("button", { name: "Create character" }).press("Enter");
  await expect(page.getByRole("status")).toHaveText("Character created.");
}

test("exposes named landmarks and announced empty states", async ({ page }) => {
  const screens = [
    {
      path: "/characters",
      heading: "Saved characters",
      emptyText: "No characters saved yet. Create your first character above.",
      control: "Name",
    },
    {
      path: "/personas",
      heading: "Saved personas",
      emptyText: "No personas saved yet. Create your first persona above.",
      control: "Name",
    },
    {
      path: "/providers",
      heading: "Saved providers",
      emptyText: "No provider configurations saved yet.",
      control: "Configuration ID",
    },
  ] as const;

  for (const screen of screens) {
    await page.goto(screen.path);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: screen.heading }),
    ).toBeVisible();
    await expect(page.getByText(screen.emptyText)).toBeVisible();
    await expect(page.getByLabel(screen.control)).toBeVisible();

    await page.getByLabel(screen.control).focus();
    await expect(page.getByLabel(screen.control)).toBeFocused();
  }
});

test("moves keyboard focus to invalid fields and keeps labels connected", async ({
  page,
}) => {
  await page.goto("/characters");
  await page.getByRole("button", { name: "Create character" }).press("Enter");
  await expect(
    page.getByRole("alert", { name: "Please correct the highlighted fields." }),
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toBeFocused();
  await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");

  await page.goto("/personas");
  await page.getByRole("button", { name: "Create persona" }).press("Enter");
  await expect(
    page.getByRole("alert", { name: "Please correct the highlighted fields." }),
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toBeFocused();
  await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");

  await page.goto("/providers");
  await page.getByLabel("Configuration ID").press("Enter");
  await expect(
    page.getByRole("alert", { name: "Please correct the highlighted fields." }),
  ).toBeVisible();
  await expect(page.getByLabel("Configuration ID")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("keeps the four MVP screens within a mobile viewport and announces chat errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of ["/characters", "/providers", "/chat", "/personas"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        })),
      )
      .toEqual({ clientWidth: 390, scrollWidth: 390 });
  }

  await createCharacter(page);
  await page.goto("/chat?test-double=error");
  await expect(page.getByRole("heading", { name: "Chat setup" })).toBeVisible();
  await page
    .getByRole("button", { name: "Start conversation with Mira Vale" })
    .press("Enter");
  await expect(page.getByRole("status")).toHaveText("Conversation created.");

  await page
    .getByLabel("Message", { exact: true })
    .fill("Show the safe failure state.");
  await page.getByRole("button", { name: "Send message" }).press("Enter");

  const errorAlert = page.getByRole("alert", {
    name: "The provider could not be reached.",
  });
  await expect(errorAlert).toBeVisible();
  await expect(errorAlert).not.toContainText("credential");
});
