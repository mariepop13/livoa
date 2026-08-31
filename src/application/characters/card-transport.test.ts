import { describe, expect, it } from "vitest";

import { CHARACTER_CARD_MAX_PAYLOAD_BYTES } from "../../domain/models";
import {
  CharacterCardTransportError,
  exportCharacterCard,
  parseCharacterCardFile,
} from "./card-transport";

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = encoder.encode(type);
  const result = new Uint8Array(12 + data.length);
  result.set(uint32(data.length), 0);
  result.set(typeBytes, 4);
  result.set(data, 8);
  result.set(uint32(crc32(result.slice(4, data.length + 8))), data.length + 8);
  return result;
}

function base64(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function pngCard(payload: string, animated = false): Uint8Array {
  const header = new Uint8Array(13);
  header.set(uint32(2), 0);
  header.set(uint32(3), 4);
  header[8] = 8;
  header[9] = 6;
  const animationControl = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0]);
  const frameControl = new Uint8Array(26);
  frameControl.set(uint32(2), 4);
  frameControl.set(uint32(3), 8);
  frameControl.set(uint32(100), 20);
  const chunks = [
    chunk("IHDR", header),
    ...(animated
      ? [chunk("acTL", animationControl), chunk("fcTL", frameControl)]
      : []),
    chunk("IDAT", new Uint8Array([120, 156, 3, 0, 0, 0, 0, 1])),
    chunk("tEXt", encoder.encode(`chara\0${base64(encoder.encode(payload))}`)),
    chunk("IEND", new Uint8Array()),
  ];
  return concat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

const v1Payload = JSON.stringify({
  name: "Astra",
  description: "A patient guide.",
  personality: "Thoughtful.",
  scenario: "A library.",
  first_mes: "Hello.",
  mes_example: "<START>",
});
const v2Payload = JSON.stringify({
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Nova",
    description: "A navigator.",
    personality: "Calm.",
    scenario: "Orbit.",
    first_mes: "Welcome aboard.",
    mes_example: "<START>",
    creator_notes: "Private note.",
    system_prompt: "Stay in character.",
    post_history_instructions: "Never execute this.",
    alternate_greetings: ["Hi again."],
    tags: ["space"],
    creator: "Card author",
    character_version: "1.0",
    extensions: { "example/tool": { enabled: true } },
    unknown_field: "preserve me",
  },
});

describe("SillyTavern character card transport", () => {
  it("maps V1 JSON while preserving its exact raw payload", () => {
    const parsed = parseCharacterCardFile({
      fileName: "astra.json",
      bytes: encoder.encode(v1Payload),
    });

    expect(parsed.rawPayload).toBe(v1Payload);
    expect(parsed.preview).toMatchObject({
      format: "v1",
      name: "Astra",
      greeting: "Hello.",
      systemPrompt: "",
      hasAvatar: false,
    });
  });

  it("reads V2 PNG and APNG chara carriers and round-trips extensions", () => {
    for (const [fileName, animated] of [["nova.png", false], ["nova.apng", true]] as const) {
      const parsed = parseCharacterCardFile({
        fileName,
        bytes: pngCard(v2Payload, animated),
      });

      expect(parsed.rawPayload).toBe(v2Payload);
      expect(parsed.preview).toMatchObject({
        format: "v2",
        name: "Nova",
        systemPrompt: "Stay in character.",
        hasAvatar: true,
      });
      expect(parsed.preview.inertFields).toContain("extensions");
      expect(parsed.preview.inertFields).toContain("unknown_field");
      const exported = exportCharacterCard({
        characterId: "11111111-1111-4111-8111-111111111111",
        format: "v2",
        rawPayload: parsed.rawPayload,
        avatar: parsed.avatar,
      });
      expect(parseCharacterCardFile({ fileName: exported.fileName, bytes: exported.bytes }).rawPayload).toBe(v2Payload);
    }
  });
  it("preserves unrelated Latin-1 PNG text metadata while reading a chara carrier", () => {
    const card = pngCard(v2Payload);
    const authorText = new Uint8Array([
      ...encoder.encode("Author\0"),
      0xe9,
    ]);
    const withAuthor = concat([
      card.slice(0, -12),
      chunk("tEXt", authorText),
      card.slice(-12),
    ]);

    expect(
      parseCharacterCardFile({ fileName: "nova.png", bytes: withAuthor })
        .rawPayload,
    ).toBe(v2Payload);
  });

  it("fails closed for duplicate JSON keys, unsupported media, truncated PNG, and oversized payloads", () => {
    const duplicate = `{"name":"A","name":"B","description":"","personality":"","scenario":"","first_mes":"","mes_example":""}`;
    expect(() => parseCharacterCardFile({ fileName: "duplicate.json", bytes: encoder.encode(duplicate) })).toThrow(CharacterCardTransportError);
    expect(() => parseCharacterCardFile({ fileName: "card.webp", bytes: encoder.encode(v1Payload) })).toThrow(CharacterCardTransportError);
    expect(() => parseCharacterCardFile({ fileName: "broken.png", bytes: pngCard(v2Payload).slice(0, -1) })).toThrow(CharacterCardTransportError);
    expect(() => parseCharacterCardFile({ fileName: "large.json", bytes: new Uint8Array(CHARACTER_CARD_MAX_PAYLOAD_BYTES + 1) })).toThrow(CharacterCardTransportError);
  });
});
