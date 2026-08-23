import { describe, expect, it, vi } from "vitest";

import type { ChatChunk, ChatRequest } from "@/domain/ports";
import {
  OpenAiCompatibleProvider,
  OpenAiCompatibleProviderError,
} from "./openai-compatible-provider";

const providerId = "openai-compatible-local";
const baseUrl = "https://provider.example/v1/";
const credential = "provider-secret-value";
const chatRequest: ChatRequest = {
  model: "chat-model",
  messages: [{ role: "user", content: "Hello" }],
};

type Fetcher = typeof globalThis.fetch;

function createProvider(fetcher: Fetcher): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider({
    id: providerId,
    baseUrl,
    credential,
    fetcher,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function eventStreamResponse(
  chunks: readonly Uint8Array[],
  cancel?: UnderlyingSourceCancelCallback,
): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }

        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  );
}

async function collectChunks(
  chunks: AsyncIterable<ChatChunk>,
): Promise<ChatChunk[]> {
  const collected: ChatChunk[] = [];

  for await (const chunk of chunks) {
    collected.push(chunk);
  }

  return collected;
}

describe("OpenAiCompatibleProvider", () => {
  it("lists validated models through the configured base URL and BYOK credential", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      jsonResponse({
        object: "list",
        data: [
          { id: "model-a", name: "Model A", object: "model" },
          { id: "model-b", object: "model" },
        ],
      }),
    );
    const provider = createProvider(fetcher);

    const models = await provider.listModels();

    expect(models).toEqual([
      {
        id: "model-a",
        displayName: "Model A",
        providerId,
      },
      {
        id: "model-b",
        displayName: "model-b",
        providerId,
      },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, init] = fetcher.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://provider.example/v1/models");
    expect(init).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      method: "GET",
      redirect: "error",
    });
    expect(headers.get("authorization")).toBe(`Bearer ${credential}`);
  });

  it("streams validated text chunks and a terminal done chunk across SSE boundaries", async () => {
    const encoder = new TextEncoder();
    const first = [
      ": keep-alive\r\n\r\n",
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\r\n\r\n',
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\r\n\r\n',
      "da",
    ].join("");
    const second = [
      'ta: {"choices":[{"delta":{"content":"lo"}}]}\r\n\r\n',
      "data: [DONE]\r\n\r\n",
    ].join("");
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        eventStreamResponse([encoder.encode(first), encoder.encode(second)]),
      );
    const provider = createProvider(fetcher);

    const chunks = await collectChunks(provider.streamChat(chatRequest));

    expect(chunks).toEqual([
      { type: "text", content: "Hel" },
      { type: "text", content: "lo" },
      { type: "done" },
    ]);

    const [url, init] = fetcher.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://provider.example/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(headers.get("accept")).toBe("text/event-stream");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      ...chatRequest,
      stream: true,
    });
  });

  it("rejects malformed model-list and streamed responses", async () => {
    const malformedModels = vi
      .fn<Fetcher>()
      .mockResolvedValue(jsonResponse({ data: [{ id: "" }] }));
    const malformedStream = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        eventStreamResponse([
          new TextEncoder().encode(
            'data: {"choices":[{"unexpected":true}]}\n\n',
          ),
        ]),
      );

    await expect(createProvider(malformedModels).listModels()).rejects.toEqual(
      expect.objectContaining({
        code: "invalid_response",
        retryable: false,
      }),
    );
    await expect(
      collectChunks(createProvider(malformedStream).streamChat(chatRequest)),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "invalid_response",
        retryable: false,
      }),
    );
  });

  it.each([
    [401, "authentication", false],
    [403, "authentication", false],
    [429, "rate_limit", true],
    [500, "network", true],
    [400, "unknown", false],
  ] as const)(
    "maps HTTP %i to a safe %s error",
    async (status, code, retryable) => {
      const fetcher = vi
        .fn<Fetcher>()
        .mockResolvedValue(new Response("provider detail", { status }));

      await expect(createProvider(fetcher).listModels()).rejects.toEqual(
        expect.objectContaining({ code, retryable }),
      );
    },
  );

  it("maps network failures without exposing raw errors or credentials", async () => {
    const rawMessage = `Request with ${credential} failed at ${baseUrl}`;
    const fetcher = vi.fn<Fetcher>().mockRejectedValue(new Error(rawMessage));

    let thrown: unknown;
    try {
      await createProvider(fetcher).listModels();
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OpenAiCompatibleProviderError);
    expect(thrown).toEqual(
      expect.objectContaining({ code: "network", retryable: true }),
    );
    expect(String(thrown)).not.toContain(credential);
    expect(String(thrown)).not.toContain(baseUrl);
    expect(String(thrown)).not.toContain(rawMessage);
  });

  it("preserves AbortSignal cancellation and cancels the response reader", async () => {
    const encoder = new TextEncoder();
    const cancel = vi.fn<UnderlyingSourceCancelCallback>();
    const stream = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          ),
        );
      },
    });
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const controller = new AbortController();
    const provider = createProvider(fetcher);
    const iterator = provider
      .streamChat(chatRequest, controller.signal)
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "text", content: "Hello" },
    });

    const abortReason = new DOMException("Cancelled by caller", "AbortError");
    controller.abort(abortReason);

    await expect(iterator.next()).rejects.toBe(abortReason);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("rejects unsafe base URLs without including their embedded credential", () => {
    const fetcher = vi.fn<Fetcher>();
    const secretUrl = "https://user:secret@provider.example/v1";

    expect(
      () =>
        new OpenAiCompatibleProvider({
          id: providerId,
          baseUrl: secretUrl,
          credential,
          fetcher,
        }),
    ).toThrowError(OpenAiCompatibleProviderError);

    try {
      new OpenAiCompatibleProvider({
        id: providerId,
        baseUrl: secretUrl,
        credential,
        fetcher,
      });
    } catch (error: unknown) {
      expect(String(error)).not.toContain("user");
      expect(String(error)).not.toContain("secret");
      expect(String(error)).not.toContain(credential);
    }
  });
});
