import { describe, expect, it, vi } from "vitest";

import {
  OpenRouterProvider,
  openRouterBaseUrl,
  openRouterProviderId,
} from "./openrouter-provider";

type Fetcher = typeof globalThis.fetch;

describe("OpenRouterProvider", () => {
  it("discovers OpenRouter models through the public API without a credential", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "openai/gpt-5.1", name: "OpenAI: GPT-5.1" },
            { id: "anthropic/claude-sonnet-4.5" },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );

    const models = await new OpenRouterProvider({ fetcher }).listModels();

    expect(models).toEqual([
      {
        id: "openai/gpt-5.1",
        displayName: "OpenAI: GPT-5.1",
        providerId: openRouterProviderId,
      },
      {
        id: "anthropic/claude-sonnet-4.5",
        displayName: "anthropic/claude-sonnet-4.5",
        providerId: openRouterProviderId,
      },
    ]);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${openRouterBaseUrl}/models`);
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
  });

  it("rejects malformed OpenRouter model responses at the infrastructure boundary", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "" }] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      new OpenRouterProvider({ fetcher }).listModels(),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("requires a BYOK credential before starting chat", async () => {
    const fetcher = vi.fn<Fetcher>();
    const iterator = new OpenRouterProvider({ fetcher })
      .streamChat({ model: "openai/gpt-5.1", messages: [] })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toMatchObject({
      code: "authentication",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
