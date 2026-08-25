import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";

const authorizationEndpoint = "https://openrouter.ai/auth";
const callbackUrl = "http://localhost:3000/providers";
const exchangeEndpoint = "https://openrouter.ai/api/v1/auth/keys";
const oauthKey = "test-oauth-api-key";
const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const exchangeBodySchema = z.object({
  code: z.string().min(1),
  code_challenge_method: z.literal("S256"),
  code_verifier: z.string().min(43).max(128),
});

type AuthorizationOutcome = "success" | "cancel" | "invalid";

type AuthorizationCapture = {
  challenge?: string;
  state?: string;
};

async function mockModels(page: Page): Promise<void> {
  await page.route("https://openrouter.ai/api/v1/models", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    });
  });
}

async function mockAuthorization(
  page: Page,
  outcome: AuthorizationOutcome,
): Promise<AuthorizationCapture> {
  const capture: AuthorizationCapture = {};

  await page.route(
    (url) => url.origin + url.pathname === authorizationEndpoint,
    async (route) => {
      const requestUrl = new URL(route.request().url());
      const challenge = requestUrl.searchParams.get("code_challenge");
      const state = requestUrl.searchParams.get("state");
      capture.challenge = challenge ?? undefined;
      capture.state = state ?? undefined;

      expect(requestUrl.searchParams.get("callback_url")).toBe(callbackUrl);
      expect(requestUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(capture.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(capture.state).toMatch(/^[A-Za-z0-9_-]{43}$/u);

      if (state === null) {
        throw new Error("Expected the authorization request to include state.");
      }

      const redirectUrl = new URL(callbackUrl);
      redirectUrl.searchParams.set(
        outcome === "cancel" ? "error" : "code",
        outcome === "cancel" ? "access_denied" : "authorization-code",
      );
      redirectUrl.searchParams.set(
        "state",
        outcome === "invalid" ? `${state}-invalid` : state,
      );

      await route.fulfill({
        status: 302,
        headers: { location: redirectUrl.toString() },
      });
    },
  );

  return capture;
}

async function openProviderSettings(page: Page): Promise<void> {
  await mockModels(page);
  await page.goto("/providers");
  await page.getByLabel("Configuration ID").fill("oauth-openrouter");
}

async function connectOpenRouter(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Connect OpenRouter account" })
    .click();
}

function expectSanitizedCallbackUrl(page: Page): void {
  const currentUrl = new URL(page.url());
  expect(currentUrl.origin + currentUrl.pathname).toBe(callbackUrl);
  expect(currentUrl.searchParams.has("code")).toBe(false);
  expect(currentUrl.searchParams.has("state")).toBe(false);
  expect(currentUrl.searchParams.has("error")).toBe(false);
  expect(currentUrl.href).not.toContain(oauthKey);
}

test("connects OpenRouter with PKCE and stores the exchanged key as a hidden credential", async ({
  page,
}) => {
  const authorization = await mockAuthorization(page, "success");
  let exchangeCalls = 0;
  let exchangeRequestFailures = 0;
  let exchangeBody: unknown;
  let exchangeMethod: string | undefined;
  let exchangeProtocol: string | undefined;
  let exchangeSearch: string | undefined;
  let preflightCalls = 0;

  page.on("requestfailed", (request) => {
    if (request.url() === exchangeEndpoint) {
      exchangeRequestFailures += 1;
    }
  });

  await page.route(exchangeEndpoint, async (route) => {
    const request = route.request();

    if (request.method() === "OPTIONS") {
      preflightCalls += 1;
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    exchangeCalls += 1;
    const requestUrl = new URL(request.url());
    exchangeBody = request.postDataJSON();
    exchangeMethod = request.method();
    exchangeProtocol = requestUrl.protocol;
    exchangeSearch = requestUrl.search;

    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ key: oauthKey, user_id: "test-user" }),
    });
  });

  await openProviderSettings(page);
  await connectOpenRouter(page);

  await expect
    .poll(() => preflightCalls + exchangeCalls + exchangeRequestFailures)
    .toBeGreaterThan(0);
  expect(exchangeRequestFailures).toBe(0);
  expect(exchangeCalls).toBe(1);
  expect(exchangeMethod).toBe("POST");
  expect(exchangeProtocol).toBe("https:");
  expect(exchangeSearch).toBe("");
  const parsedExchangeBody = exchangeBodySchema.parse(exchangeBody);
  expect(
    createHash("sha256")
      .update(parsedExchangeBody.code_verifier)
      .digest("base64url"),
  ).toBe(authorization.challenge);
  await expect(
    page.getByRole("status").filter({
      hasText:
        "OpenRouter connected for oauth-openrouter. The credential is saved and hidden.",
    }),
  ).toBeVisible();
  expectSanitizedCallbackUrl(page);
  await expect(
    page.getByRole("listitem").filter({ hasText: "oauth-openrouter" }),
  ).toContainText("Credential: Saved and hidden");
  await expect(page.getByText(oauthKey)).toHaveCount(0);
});

test("announces cancellation and does not exchange a code", async ({
  page,
}) => {
  await mockAuthorization(page, "cancel");
  let exchangeCalls = 0;
  await page.route(exchangeEndpoint, async (route) => {
    exchangeCalls += 1;
    await route.abort();
  });

  await openProviderSettings(page);
  await connectOpenRouter(page);

  await expect(
    page.getByRole("status").filter({
      hasText: "OpenRouter connection cancelled. No new credential was saved.",
    }),
  ).toBeVisible();
  expect(exchangeCalls).toBe(0);
  expectSanitizedCallbackUrl(page);
});

test("rejects a callback with mismatched state and clears callback parameters", async ({
  page,
}) => {
  await mockAuthorization(page, "invalid");
  let exchangeCalls = 0;
  await page.route(exchangeEndpoint, async (route) => {
    exchangeCalls += 1;
    await route.abort();
  });

  await openProviderSettings(page);
  await connectOpenRouter(page);

  await expect(
    page.getByRole("alert").filter({
      hasText:
        "The OpenRouter callback was invalid. Start the connection again.",
    }),
  ).toBeVisible();
  expect(exchangeCalls).toBe(0);
  expectSanitizedCallbackUrl(page);
});

test("shows a safe error when OpenRouter rejects the exchange", async ({
  page,
}) => {
  await mockAuthorization(page, "success");
  await page.route(exchangeEndpoint, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    await route.fulfill({
      status: 403,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        error: "provider-detail-that-must-not-render",
      }),
    });
  });

  await openProviderSettings(page);
  await connectOpenRouter(page);

  await expect(
    page.getByRole("alert").filter({
      hasText: "OpenRouter could not complete the connection. Start again.",
    }),
  ).toBeVisible();
  expectSanitizedCallbackUrl(page);
  await expect(
    page.getByText("provider-detail-that-must-not-render"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("listitem").filter({ hasText: "oauth-openrouter" }),
  ).toContainText("Credential: Not saved");
});
