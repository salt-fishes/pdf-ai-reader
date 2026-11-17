import type { ServerConfig } from "./ai/types";
import { desktopPlatform, isDesktop, type PdfAssociationStatus } from "./desktop";

export type DiagnosticTone = "ok" | "warn" | "error";

export type DiagnosticRow = {
  id: string;
  label: string;
  detail: string;
  tone: DiagnosticTone;
  /** Settings section that can fix the issue. */
  section?: "model" | "ocr" | "about" | "privacy";
};

export type DiagnosticsReport = {
  at: number;
  rows: DiagnosticRow[];
  copyText: string;
};

type Input = {
  config: ServerConfig | null;
  model: string;
  configError: string | null;
  ocrStatus: {
    installed: boolean;
    runtime?: { installed: boolean; downloading: boolean; error: string | null };
    activeModel?: string;
    error: string | null;
  } | null;
  ocrError: string | null;
  association?: PdfAssociationStatus | null;
  expectedVersion: string;
};

async function localServiceReachable(): Promise<boolean> {
  try {
    const response = await fetch("/api/health", { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "0 MB";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    if (typeof usage !== "number" || typeof quota !== "number") return null;
    return { usage, quota };
  } catch {
    return null;
  }
}

function providerHost(config: ServerConfig | null): string {
  if (!config) return "—";
  if (config.baseUrlHost) return config.baseUrlHost;
  try {
    return config.baseUrl ? new URL(config.baseUrl).host : "—";
  } catch {
    return config.baseUrl || "—";
  }
}

/**
 * Runtime status for the About page. It answers “what is broken right now and
 * where do I fix it”, instead of dumping an opaque version string.
 */
export async function collectDiagnostics(input: Input): Promise<DiagnosticsReport> {
  const [serviceUp, storage] = await Promise.all([localServiceReachable(), storageUsage()]);
  const runtime = input.ocrStatus?.runtime;
  const rows: DiagnosticRow[] = [];

  rows.push(
    serviceUp
      ? {
          id: "service",
          label: "本地阅读服务",
          detail: "运行正常，PDF 解析与 OCR 只在本机进行。",
          tone: "ok",
        }
      : {
          id: "service",
          label: "本地阅读服务",
          detail: "无法连接。请重启应用；若问题持续，查看下方运行信息。",
          tone: "error",
        },
  );

  if (!input.config) {
    rows.push({
      id: "model",
      label: "模型服务",
      detail: input.configError || "尚未读取到配置，打开“模型服务”填写 API Key。",
      tone: input.configError ? "error" : "warn",
      section: "model",
    });
  } else if (input.config.mock) {
    rows.push({
      id: "model",
      label: "模型服务",
      detail: "正在使用本地演示模式，不会请求外部服务。",
      tone: "warn",
      section: "model",
    });
  } else if (!input.config.hasKey) {
    rows.push({
      id: "model",
      label: "模型服务",
      detail: "尚未填写 API Key，AI 对话不可用。",
      tone: "warn",
      section: "model",
    });
  } else {
    rows.push({
      id: "model",
      label: "模型服务",
      detail: `${providerHost(input.config)} · ${input.model || input.config.model}`,
      tone: "ok",
    });
  }

  if (!runtime) {
    rows.push({
      id: "ocr",
      label: "扫描件 OCR",
      detail: "尚未安装。需要识别扫描件时可在设置中下载。",
      tone: "warn",
      section: "ocr",
    });
  } else if (runtime.downloading) {
    rows.push({
      id: "ocr",
      label: "扫描件 OCR",
      detail: "组件正在下载，完成后即可离线识别。",
      tone: "warn",
      section: "ocr",
    });
  } else if (!runtime.installed) {
    rows.push({
      id: "ocr",
      label: "扫描件 OCR",
      detail: runtime.error || "组件缺失，请到设置中下载或修复。",
      tone: "error",
      section: "ocr",
    });
  } else if (input.ocrStatus && !input.ocrStatus.installed) {
    rows.push({
      id: "ocr",
      label: "扫描件 OCR",
      detail: `组件已就绪，当前模型（${input.ocrStatus.activeModel ?? "tiny"}）尚未下载。`,
      tone: "warn",
      section: "ocr",
    });
  } else {
    rows.push({
      id: "ocr",
      label: "扫描件 OCR",
      detail: input.ocrError ? `组件已安装，最近一次错误：${input.ocrError}` : "组件与模型已就绪。",
      tone: input.ocrError ? "warn" : "ok",
      section: "ocr",
    });
  }

  rows.push(
    storage
      ? {
          id: "storage",
          label: "本地数据",
          detail: `已使用 ${formatBytes(storage.usage)}，可用 ${formatBytes(storage.quota)}。`,
          tone: storage.quota > 0 && storage.usage / storage.quota > 0.9 ? "warn" : "ok",
          section: "privacy",
        }
      : {
          id: "storage",
          label: "本地数据",
          detail: "阅读记录保存在本机；当前环境不提供用量统计。",
          tone: "ok",
          section: "privacy",
        },
  );

  if (input.association?.supported) {
    rows.push({
      id: "association",
      label: "默认 PDF 应用",
      detail: input.association.isDefault
        ? "文疏是当前默认 PDF 应用。"
        : input.association.stale
          ? "已注册，但程序路径已变化，请重新注册。"
          : input.association.registered
            ? "已注册打开方式，尚未设为默认。"
            : "尚未注册。可在“关于”中注册到系统。",
      tone: input.association.isDefault || input.association.registered ? "ok" : "warn",
      section: "about",
    });
  }

  const versions = window.paperReader?.versions;
  const copyText = [
    `文疏 ${input.expectedVersion}`,
    `构建 ${__GIT_SHA__} · ${__BUILD_DATE__}`,
    `平台 ${desktopPlatform() || navigator.platform || "—"}${isDesktop() ? "（桌面版）" : "（浏览器）"}`,
    versions?.electron ? `Electron ${versions.electron} · Chromium ${versions.chrome ?? "—"}` : "",
    `本地服务 ${serviceUp ? "正常" : "不可用"}`,
    `模型 ${providerHost(input.config)} · ${input.model || "—"}`,
    `OCR 组件 ${runtime ? (runtime.installed ? "已安装" : "未安装") : "未知"}`,
    storage ? `本地数据 ${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}` : "",
    ...rows.filter((row) => row.tone !== "ok").map((row) => `${row.label}：${row.detail}`),
  ]
    .filter(Boolean)
    .join("\n");

  return { at: Date.now(), rows, copyText };
}
