import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

async function fillCharacterForm(page: Page) {
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
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(
    // PNG uses the IEEE CRC32 polynomial. The known valid cover carries its own
    // image chunks; this test fixture only creates the official chara tEXt chunk.
    crc32(chunk.subarray(4, data.length + 8)),
    data.length + 8,
  );
  return chunk;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngCard(payload: string): Buffer {
  const cover = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=",
    "base64",
  );
  const iendOffset = cover.length - 12;
  const carrier = pngChunk(
    "tEXt",
    Buffer.concat([
      Buffer.from("chara\0", "ascii"),
      Buffer.from(Buffer.from(payload).toString("base64"), "ascii"),
    ]),
  );
  return Buffer.concat([cover.subarray(0, iendOffset), carrier, cover.subarray(iendOffset)]);
}

test("creates a character with the keyboard and keeps it after reload", async ({
  page,
}) => {
  await page.goto("/characters");
  await fillCharacterForm(page);

  await page.getByLabel("Greeting (optional)").press("Tab");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("status")).toHaveText("Character created.");
  await expect(page.getByRole("heading", { name: "Mira Vale" })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", { name: "Mira Vale" })).toBeVisible();
});

test("edits a saved character", async ({ page }) => {
  await page.goto("/characters");
  await fillCharacterForm(page);
  await page.getByRole("button", { name: "Create character" }).click();

  await page.getByRole("button", { name: "Edit Mira Vale" }).click();
  await page.getByLabel("Name").fill("Mira North");
  await page.getByRole("button", { name: "Save character changes" }).click();

  await expect(page.getByRole("status")).toHaveText("Character updated.");
  await expect(page.getByRole("heading", { name: "Mira North" })).toBeVisible();
});

test("creates and edits a character avatar with accessible rendering", async ({
  page,
}) => {
  await page.goto("/characters");
  await fillCharacterForm(page);

  const initialAvatarUrl = "http://localhost:3000/characters?avatar=mira-vale";
  await page.getByLabel("Avatar URL (optional)").fill(initialAvatarUrl);
  await page.getByRole("button", { name: "Create character" }).click();

  await expect(page.getByRole("status")).toHaveText("Character created.");
  const avatar = page.getByRole("img", { name: "Mira Vale avatar" });
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute("src", initialAvatarUrl);

  await page.getByRole("button", { name: "Edit Mira Vale" }).click();
  await expect(page.getByLabel("Avatar URL (optional)")).toHaveValue(
    initialAvatarUrl,
  );

  const updatedAvatarUrl = "http://localhost:3000/characters?avatar=mira-north";
  await page.getByLabel("Avatar URL (optional)").fill(updatedAvatarUrl);
  await page.getByRole("button", { name: "Save character changes" }).click();

  await expect(page.getByRole("status")).toHaveText("Character updated.");
  await expect(avatar).toHaveAttribute("src", updatedAvatarUrl);
});

test("shows accessible validation feedback", async ({ page }) => {
  await page.goto("/characters");
  await page.getByRole("button", { name: "Create character" }).click();

  await expect(
    page.getByRole("alert", {
      name: "Please correct the highlighted fields.",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
});

test("imports, reloads, exports, and re-imports a PNG character card", async ({
  page,
}) => {
  const payload = JSON.stringify({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Imported Nova",
      description: "A locally imported navigator.",
      personality: "Calm and precise.",
      scenario: "Inert.",
      first_mes: "Welcome aboard.",
      mes_example: "Inert.",
      creator_notes: "Inert.",
      system_prompt: "Imported system prompt.",
      post_history_instructions: "Inert.",
      alternate_greetings: [],
      tags: [],
      creator: "Test fixture",
      character_version: "1",
      extensions: { "test/card": true },
    },
  });

  await page.goto("/characters");
  await page.getByLabel("Character card file").setInputFiles({
    name: "nova.png",
    mimeType: "image/png",
    buffer: pngCard(payload),
  });
  await expect(
    page.getByRole("heading", { name: "Import preview: Imported Nova" }),
  ).toBeVisible();
  await expect(page.getByText("Imported system prompt.")).toBeVisible();
  await expect(page.getByText(/post_history_instructions/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("status")).toHaveText("Character card imported.");
  await expect(
    page.getByRole("img", { name: "Imported Nova avatar" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("img", { name: "Imported Nova avatar" }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Imported Nova card" }).click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  if (exportedPath === null) {
    throw new Error("Expected exported character card download");
  }
  const exported = await readFile(exportedPath);

  await page.getByLabel("Character card file").setInputFiles({
    name: "reimported-nova.png",
    mimeType: "image/png",
    buffer: exported,
  });
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("status")).toHaveText("Character card imported.");
  await expect(
    page.getByRole("heading", { name: "Imported Nova" }),
  ).toHaveCount(2);
});
