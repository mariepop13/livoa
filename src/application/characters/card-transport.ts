import {
  CHARACTER_CARD_MAX_AVATAR_BYTES,
  CHARACTER_CARD_MAX_PAYLOAD_BYTES,
  type CharacterCard,
} from "../../domain/models";

export const CHARACTER_CARD_MAX_FILE_BYTES = 5 * 1024 * 1024;

export type CharacterCardPreview = Readonly<{
  format: "v1" | "v2";
  name: string;
  description: string;
  personality: string;
  systemPrompt: string;
  greeting: string;
  inertFields: readonly string[];
  hasAvatar: boolean;
}>;

export type ParsedCharacterCard = Readonly<{
  preview: CharacterCardPreview;
  rawPayload: string;
  avatar?: CharacterCard["avatar"];
}>;

export type CharacterCardExport = Readonly<{
  fileName: string;
  mediaType: "application/json" | "image/png" | "image/apng";
  bytes: Uint8Array;
}>;

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

type PngChunk = Readonly<{ type: string; data: Uint8Array }>;
type ParsedPng = Readonly<{
  chunks: readonly PngChunk[];
  mediaType: "image/png" | "image/apng";
}>;

const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const textEncoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_APNG_FRAMES = 100;
// Bounds browser decoder work to 64 MiB of RGBA-equivalent frame pixels.
const MAX_APNG_TOTAL_FRAME_PIXELS = 16 * 1024 * 1024;

export class CharacterCardTransportError extends Error {
  public constructor() {
    super("This file is not a supported SillyTavern character card.");
  }
}

function fail(): never {
  throw new CharacterCardTransportError();
}


function isString(value: JsonValue | undefined): value is string {
  return typeof value === "string";
}

function getRequiredString(
  record: { readonly [key: string]: JsonValue },
  key: string,
): string {
  const value = record[key];
  return isString(value) ? value : fail();
}

/** Validates JSON grammar and duplicate object keys before JSON.parse preserves values. */
function parseJsonPayload(payload: string): JsonValue {
  let index = 0;

  function whitespace(): void {
    while (
      payload[index] === " " ||
      payload[index] === "\n" ||
      payload[index] === "\r" ||
      payload[index] === "\t"
    ) {
      index += 1;
    }
  }

  function string(): string {
    const start = index;
    if (payload[index] !== '"') fail();
    index += 1;
    while (index < payload.length) {
      const character = payload[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(payload.slice(start, index)) as string;
        } catch {
          return fail();
        }
      }
      if (character === "\\") {
        const escape = payload[index + 1];
        if (escape === "u") {
          const codePoint = payload.slice(index + 2, index + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(codePoint)) fail();
          index += 6;
          continue;
        }
        if (escape === undefined || !'"\\/bfnrt'.includes(escape)) fail();
        index += 2;
        continue;
      }
      if (character === undefined || character.charCodeAt(0) < 0x20) fail();
      index += 1;
    }
    return fail();
  }

  function value(depth: number): void {
    if (depth > 100) fail();
    whitespace();
    const character = payload[index];
    if (character === '"') {
      string();
      return;
    }
    if (character === "{") {
      index += 1;
      whitespace();
      const keys = new Set<string>();
      if (payload[index] === "}") {
        index += 1;
        return;
      }
      while (true) {
        whitespace();
        const key = string();
        if (keys.has(key)) fail();
        keys.add(key);
        whitespace();
        if (payload[index] !== ":") fail();
        index += 1;
        value(depth + 1);
        whitespace();
        if (payload[index] === "}") {
          index += 1;
          return;
        }
        if (payload[index] !== ",") fail();
        index += 1;
      }
    }
    if (character === "[") {
      index += 1;
      whitespace();
      if (payload[index] === "]") {
        index += 1;
        return;
      }
      while (true) {
        value(depth + 1);
        whitespace();
        if (payload[index] === "]") {
          index += 1;
          return;
        }
        if (payload[index] !== ",") fail();
        index += 1;
      }
    }
    const literal = payload.slice(index);
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(literal);
    if (match === null) fail();
    index += match[0].length;
  }

  try {
    whitespace();
    value(0);
    whitespace();
    if (index !== payload.length) fail();
    return JSON.parse(payload) as JsonValue;
  } catch (error: unknown) {
    if (error instanceof CharacterCardTransportError) throw error;
    return fail();
  }
}

function bytesToUtf8(bytes: Uint8Array): string {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    return fail();
  }
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    bytes[offset + 1]! * 0x10000 +
    bytes[offset + 2]! * 0x100 +
    bytes[offset + 3]!
  );
}

function writeUint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

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

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function ascii(bytes: Uint8Array): string {
  if (bytes.some((byte) => byte > 0x7f)) fail();
  return String.fromCharCode(...bytes);
}

function parsePng(bytes: Uint8Array): ParsedPng {
  if (
    bytes.length > CHARACTER_CARD_MAX_AVATAR_BYTES ||
    !bytesEqual(bytes.slice(0, 8), pngSignature)
  ) {
    fail();
  }
  const chunks: PngChunk[] = [];
  let offset = 8;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let hasImageData = false;
  let hasEnd = false;
  let hasAnimationControl = false;
  let declaredFrames = 0;
  let seenFrames = 0;
  let totalFramePixels = 0;
  let nextAnimationSequence = 0;
  let activeFrameHasData = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length || chunks.length >= 10_000) fail();
    const length = readUint32(bytes, offset);
    const end = offset + 12 + length;
    if (!Number.isSafeInteger(end) || end > bytes.length) fail();
    const typeBytes = bytes.slice(offset + 4, offset + 8);
    const type = ascii(typeBytes);
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (
      crc32(bytes.slice(offset + 4, offset + 8 + length)) !==
      readUint32(bytes, offset + 8 + length)
    ) {
      fail();
    }
    if (chunks.length === 0) {
      if (type !== "IHDR" || length !== 13) fail();
      canvasWidth = readUint32(data, 0);
      canvasHeight = readUint32(data, 4);
      if (
        canvasWidth === 0 ||
        canvasHeight === 0 ||
        canvasWidth > 4096 ||
        canvasHeight > 4096
      ) {
        fail();
      }
    }
    if (type === "acTL") {
      if (hasAnimationControl || hasImageData || length !== 8) fail();
      declaredFrames = readUint32(data, 0);
      if (declaredFrames === 0 || declaredFrames > MAX_APNG_FRAMES) fail();
      hasAnimationControl = true;
    } else if (type === "fcTL") {
      if (!hasAnimationControl || length !== 26 || seenFrames >= declaredFrames) {
        fail();
      }
      if (seenFrames > 0 && !activeFrameHasData) fail();
      if (readUint32(data, 0) !== nextAnimationSequence) fail();
      nextAnimationSequence += 1;
      const frameWidth = readUint32(data, 4);
      const frameHeight = readUint32(data, 8);
      const frameX = readUint32(data, 12);
      const frameY = readUint32(data, 16);
      if (
        frameWidth === 0 ||
        frameHeight === 0 ||
        frameX + frameWidth > canvasWidth ||
        frameY + frameHeight > canvasHeight
      ) {
        fail();
      }
      totalFramePixels += frameWidth * frameHeight;
      if (totalFramePixels > MAX_APNG_TOTAL_FRAME_PIXELS) fail();
      seenFrames += 1;
      activeFrameHasData = false;
    } else if (type === "IDAT") {
      if (hasAnimationControl && seenFrames !== 1) {
        fail();
      }
      hasImageData = true;
      activeFrameHasData = true;
    } else if (type === "fdAT") {
      if (
        !hasAnimationControl ||
        !hasImageData ||
        seenFrames < 2 ||
        length <= 4 ||
        readUint32(data, 0) !== nextAnimationSequence
      ) {
        fail();
      }
      activeFrameHasData = true;
      nextAnimationSequence += 1;
    }
    if (type === "IEND") {
      if (length !== 0 || hasEnd || end !== bytes.length) fail();
      hasEnd = true;
    } else if (hasEnd) {
      fail();
    }
    chunks.push({ type, data });
    offset = end;
  }
  if (
    chunks.length === 0 ||
    !hasImageData ||
    !hasEnd ||
    (hasAnimationControl &&
      (seenFrames !== declaredFrames || !activeFrameHasData))
  ) {
    fail();
  }
  return {
    chunks,
    mediaType: hasAnimationControl ? "image/apng" : "image/png",
  };
}

function decodeBase64(encoded: string): Uint8Array {
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  ) fail();
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (btoa(binary) !== encoded) fail();
    return bytes;
  } catch {
    return fail();
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function parsePayload(
  payload: string,
  avatar?: CharacterCard["avatar"],
): ParsedCharacterCard {
  if (textEncoder.encode(payload).byteLength > CHARACTER_CARD_MAX_PAYLOAD_BYTES) {
    fail();
  }
  const parsed = parseJsonPayload(payload);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fail();
  }
  const card = parsed as { readonly [key: string]: JsonValue };
  const v2 = card.spec === "chara_card_v2" && card.spec_version === "2.0";
  const data = v2 ? card.data : card;
  if (typeof data !== "object" || data === null || Array.isArray(data)) fail();
  const fields = data as { readonly [key: string]: JsonValue };
  const name = getRequiredString(fields, "name");
  const description = getRequiredString(fields, "description");
  const personality = getRequiredString(fields, "personality");
  const greeting = getRequiredString(fields, "first_mes");
  getRequiredString(fields, "scenario");
  getRequiredString(fields, "mes_example");
  const systemPrompt = v2 ? getRequiredString(fields, "system_prompt") : "";
  if (v2) {
    getRequiredString(fields, "creator_notes");
    getRequiredString(fields, "post_history_instructions");
    if (
      !Array.isArray(fields.alternate_greetings) ||
      !fields.alternate_greetings.every(isString)
    ) {
      fail();
    }
    if (!Array.isArray(fields.tags) || !fields.tags.every(isString)) fail();
    getRequiredString(fields, "creator");
    getRequiredString(fields, "character_version");
    if (
      typeof fields.extensions !== "object" ||
      fields.extensions === null ||
      Array.isArray(fields.extensions)
    ) {
      fail();
    }
  }
  const supported = new Set([
    "name",
    "description",
    "personality",
    "system_prompt",
    "first_mes",
  ]);
  const inertFields = Object.keys(fields).filter((key) => !supported.has(key));
  if (v2) {
    for (const key of Object.keys(card)) {
      if (key !== "spec" && key !== "spec_version" && key !== "data") {
        inertFields.push(key);
      }
    }
  }
  return {
    rawPayload: payload,
    avatar,
    preview: {
      format: v2 ? "v2" : "v1",
      name,
      description,
      personality,
      systemPrompt,
      greeting,
      inertFields: [...new Set(inertFields)].sort(),
      hasAvatar: avatar !== undefined,
    },
  };
}

function textChunkKeyword(data: Uint8Array): string | undefined {
  const separator = data.indexOf(0);
  if (separator < 1 || data.slice(0, separator).some((byte) => byte > 0x7f)) {
    return undefined;
  }
  return String.fromCharCode(...data.slice(0, separator)).toLowerCase();
}

function charaText(data: Uint8Array): string | undefined {
  const separator = data.indexOf(0);
  if (textChunkKeyword(data) !== "chara" || separator < 1) return undefined;
  return ascii(data.slice(separator + 1));
}

export function parseCharacterCardFile(input: Readonly<{ fileName: string; bytes: Uint8Array }>): ParsedCharacterCard {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > CHARACTER_CARD_MAX_FILE_BYTES) fail();
  const fileName = input.fileName.toLowerCase();
  if (fileName.endsWith(".json")) return parsePayload(bytesToUtf8(input.bytes));
  if (!fileName.endsWith(".png") && !fileName.endsWith(".apng")) fail();
  const png = parsePng(input.bytes);
  const carriers = png.chunks
    .filter((chunk) => chunk.type === "tEXt")
    .map((chunk) => charaText(chunk.data))
    .filter((text): text is string => text !== undefined);
  if (carriers.length !== 1) fail();
  const payloadBytes = decodeBase64(carriers[0]);
  if (payloadBytes.byteLength > CHARACTER_CARD_MAX_PAYLOAD_BYTES) fail();
  return parsePayload(bytesToUtf8(payloadBytes), {
    mediaType: png.mediaType,
    bytes: input.bytes.slice(),
  });
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = textEncoder.encode(type);
  const raw = new Uint8Array(12 + data.byteLength);
  raw.set(writeUint32(data.byteLength), 0);
  raw.set(typeBytes, 4);
  raw.set(data, 8);
  raw.set(writeUint32(crc32(raw.slice(4, 8 + data.byteLength))), 8 + data.byteLength);
  return raw;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

export function exportCharacterCard(card: CharacterCard): CharacterCardExport {
  const parsed = parsePayload(card.rawPayload, card.avatar);
  if (parsed.preview.format !== card.format) fail();
  const jsonBytes = textEncoder.encode(card.rawPayload);
  if (card.avatar === undefined) {
    return { fileName: `${parsed.preview.name}.json`, mediaType: "application/json", bytes: jsonBytes };
  }
  const png = parsePng(card.avatar.bytes);
  if (png.mediaType !== card.avatar.mediaType) fail();
  const chunks: Uint8Array[] = [pngSignature];
  for (const chunk of png.chunks) {
    if (chunk.type === "tEXt") {
      const keyword = textChunkKeyword(chunk.data);
      if (keyword === "chara" || keyword === "ccv3") continue;
    }
    if (chunk.type === "IEND") {
      chunks.push(pngChunk("tEXt", textEncoder.encode(`chara\0${encodeBase64(jsonBytes)}`)));
    }
    chunks.push(pngChunk(chunk.type, chunk.data));
  }
  return {
    fileName: `${parsed.preview.name}.${card.avatar.mediaType === "image/apng" ? "apng" : "png"}`,
    mediaType: card.avatar.mediaType,
    bytes: concat(chunks),
  };
}
