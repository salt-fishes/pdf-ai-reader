import { describe, expect, it } from "vitest";
import {
  chatSchema,
  ocrConfigSchema,
  ocrSourceSchema,
  ocrSourceTestSchema,
  providerConfigSchema,
} from "../../server/src/schemas";

describe("server request schemas", () => {
  it("accepts partial provider updates and rejects oversized fields", () => {
    expect(providerConfigSchema.safeParse({}).success).toBe(true);
    expect(
      providerConfigSchema.safeParse({ baseUrl: "https://api.example.com/v1", model: "x" }).success,
    ).toBe(true);
    expect(providerConfigSchema.safeParse({ model: "x".repeat(97) }).success).toBe(false);
    expect(providerConfigSchema.safeParse({ modelAllow: ["ok", 1] }).success).toBe(false);
    expect(providerConfigSchema.safeParse({ clearKey: "yes" }).success).toBe(false);
  });

  it("only accepts the three OCR model ids", () => {
    expect(ocrConfigSchema.safeParse({ model: "v6-tiny" }).success).toBe(true);
    expect(ocrConfigSchema.safeParse({ model: "v7-large" }).success).toBe(false);
    expect(ocrConfigSchema.safeParse({}).success).toBe(false);
  });

  it("validates OCR source and test payloads", () => {
    expect(
      ocrSourceSchema.safeParse({ baseUrl: "https://mirror.example.com/ppocrv6" }).success,
    ).toBe(true);
    expect(ocrSourceSchema.safeParse({}).success).toBe(false);
    expect(ocrSourceTestSchema.safeParse({}).success).toBe(true);
    expect(ocrSourceTestSchema.safeParse({ model: "v6-small" }).success).toBe(true);
    expect(ocrSourceTestSchema.safeParse({ model: "nope" }).success).toBe(false);
  });

  it("keeps chat messages for the dedicated validator", () => {
    expect(chatSchema.safeParse({ messages: [{ role: "user", content: "hi" }] }).success).toBe(
      true,
    );
    expect(chatSchema.safeParse({ messages: "not-an-array" }).success).toBe(true);
    expect(chatSchema.safeParse({ messages: [], model: "x".repeat(97) }).success).toBe(false);
    expect(chatSchema.safeParse({ messages: [], effort: "ultra" }).success).toBe(true);
  });
});
