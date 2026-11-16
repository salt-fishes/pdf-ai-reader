import { z } from "zod";

const modelName = z.string().trim().min(1).max(96);
const baseUrl = z.string().trim().min(8).max(2048);

export const providerConfigSchema = z.object({
  baseUrl: baseUrl.optional(),
  model: modelName.optional(),
  modelAllow: z.array(modelName).max(64).optional(),
  apiKey: z.string().max(4096).optional(),
  clearKey: z.boolean().optional(),
});

export const ocrModelSchema = z.enum(["v6-tiny", "v6-small", "v6-medium"]);

export const ocrInstallSchema = z.object({
  model: ocrModelSchema.optional(),
});

export const ocrConfigSchema = z.object({
  model: ocrModelSchema,
});

export const ocrSourceSchema = z.object({
  baseUrl,
});

export const ocrSourceTestSchema = z.object({
  baseUrl: baseUrl.optional(),
  model: ocrModelSchema.optional(),
});

export const ocrImageSchema = z.object({
  image: z.string().min(32).max(20_000_000),
});

export const chatSchema = z.object({
  messages: z.unknown(),
  model: modelName.optional(),
  effort: z.string().max(16).optional(),
});

export type ProviderConfigInput = z.infer<typeof providerConfigSchema>;
export type OcrInstallInput = z.infer<typeof ocrInstallSchema>;
export type OcrConfigInput = z.infer<typeof ocrConfigSchema>;
export type OcrSourceInput = z.infer<typeof ocrSourceSchema>;
export type OcrSourceTestInput = z.infer<typeof ocrSourceTestSchema>;
export type OcrImageInput = z.infer<typeof ocrImageSchema>;
export type ChatInput = z.infer<typeof chatSchema>;
