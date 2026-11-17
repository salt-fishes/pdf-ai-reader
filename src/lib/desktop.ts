/**
 * Single source of truth for the preload bridge.
 *
 * The renderer is also shipped as a browser build, so every method is optional
 * and every call must degrade gracefully when `window.paperReader` is absent.
 */

export type UpdateInfo = {
  current: string;
  latest: string;
  hasUpdate: boolean;
  url: string;
  notes?: string;
  publishedAt?: string;
};

export type PdfAssociationScope = "user" | "machine";

export type PdfAssociationStatus = {
  supported: boolean;
  registered: boolean;
  scope: PdfAssociationScope | null;
  stale: boolean;
  isDefault: boolean;
  currentDefault: string | null;
  appName: string;
};

export type DesktopPdfPayload = {
  name: string;
  /** Uint8Array over IPC; older bridges may hand back a plain number array. */
  bytes: Uint8Array | number[];
};

export type DesktopBridge = {
  isDesktop?: boolean;
  platform?: string;
  checkForUpdates?: () => Promise<UpdateInfo>;
  pdfAssociation?: {
    status: () => Promise<PdfAssociationStatus>;
    register: (scope?: PdfAssociationScope) => Promise<PdfAssociationStatus>;
    remove: (scope?: PdfAssociationScope) => Promise<PdfAssociationStatus>;
    openSettings: () => Promise<PdfAssociationStatus>;
  };
  versions?: { electron?: string; chrome?: string };
  setTitleBarTheme?: (dark: boolean) => void | Promise<void>;
  takePendingPdf?: () => Promise<DesktopPdfPayload | null>;
  onOpenPdf?: (callback: (payload: DesktopPdfPayload) => void) => () => void;
  rendererReady?: () => void;
  openDataFolder?: () => Promise<void>;
};

declare global {
  interface Window {
    paperReader?: DesktopBridge;
  }
}

export function desktopBridge(): DesktopBridge | undefined {
  return typeof window === "undefined" ? undefined : window.paperReader;
}

export function isDesktop(): boolean {
  return Boolean(desktopBridge()?.isDesktop);
}

export function desktopPlatform(): string {
  return desktopBridge()?.platform ?? "";
}

/** Keep the Windows caption buttons in sync with the reading theme. */
export function setTitleBarTheme(dark: boolean): void {
  const bridge = desktopBridge();
  if (!bridge?.setTitleBarTheme) return;
  void Promise.resolve(bridge.setTitleBarTheme(dark)).catch(() => undefined);
}

/** Tell the main process that React listeners are attached. */
export function markRendererReady(): void {
  desktopBridge()?.rendererReady?.();
}

/**
 * One-shot handoff: the main process reads and clears its pending PDF, so the
 * file can never be opened twice by a later effect or remount.
 */
export async function takePendingPdf(): Promise<DesktopPdfPayload | null> {
  try {
    return (await desktopBridge()?.takePendingPdf?.()) ?? null;
  } catch {
    return null;
  }
}

/** Second-instance file opens. Returns an unsubscribe function. */
export function onOpenPdf(callback: (payload: DesktopPdfPayload) => void): () => void {
  const bridge = desktopBridge();
  if (!bridge?.onOpenPdf) return () => undefined;
  return bridge.onOpenPdf(callback);
}

/** Reveal the app data folder in Explorer (desktop only). */
export async function openDataFolder(): Promise<void> {
  const bridge = desktopBridge();
  if (!bridge?.openDataFolder) throw new Error("只有桌面版可以打开数据文件夹。");
  await bridge.openDataFolder();
}

/** Convert the IPC payload into the File shape the reader already accepts. */
export function fileFromDesktopPayload(payload: DesktopPdfPayload): File {
  const view = payload.bytes instanceof Uint8Array ? payload.bytes : new Uint8Array(payload.bytes);
  // Copy into a fresh buffer: the IPC-backed view may be detached or shared.
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(view);
  return new File([bytes], payload.name, { type: "application/pdf" });
}
