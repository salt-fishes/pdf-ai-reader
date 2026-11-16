import { gt, prerelease, valid } from "semver";

export type UpdateInfo = {
  current: string;
  latest: string;
  hasUpdate: boolean;
  url: string;
  notes?: string;
  publishedAt?: string;
};

type DesktopBridge = {
  checkForUpdates?: () => Promise<UpdateInfo>;
  versions?: { electron?: string; chrome?: string };
};

declare global {
  interface Window {
    paperReader?: DesktopBridge;
  }
}

const REPO = "salt-fishes/pdf-ai-reader";
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_MS = 5 * 60 * 1000;

let cache: { at: number; value: UpdateInfo } | null = null;

function normalize(version: string): string {
  return version.trim().replace(/^v/i, "");
}

/** Compares two release strings without treating an rc build as newer. */
export function compareVersions(current: string, latest: string): boolean {
  const currentVersion = valid(normalize(current));
  const latestVersion = valid(normalize(latest));
  if (!currentVersion || !latestVersion) return false;
  return gt(latestVersion, currentVersion);
}

export function isPrerelease(version: string): boolean {
  const parsed = valid(normalize(version));
  return Boolean(parsed && prerelease(parsed));
}

async function requestLatest(): Promise<UpdateInfo> {
  const response = await fetch(API_URL, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 403 || response.status === 429) {
    throw new Error("GitHub API 请求过于频繁，请稍后重试。");
  }
  if (!response.ok) {
    throw new Error(`无法连接 GitHub（HTTP ${response.status}），请稍后重试。`);
  }
  const data = (await response.json()) as {
    tag_name?: string;
    html_url?: string;
    body?: string;
    published_at?: string;
  };
  const latest = normalize(data.tag_name ?? "");
  if (!valid(latest)) throw new Error("最新的发布标签不是有效版本号，无法比较。");
  const current = __APP_VERSION__;
  return {
    current,
    latest,
    hasUpdate: compareVersions(current, latest),
    url: data.html_url || `${RELEASES_URL}/tag/v${latest}`,
    notes: data.body?.slice(0, 4000),
    publishedAt: data.published_at,
  };
}

/** Manual-only update check. Never called during startup. */
export async function checkForUpdates(force = false): Promise<UpdateInfo> {
  if (cache && !force && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = window.paperReader?.checkForUpdates
    ? await window.paperReader.checkForUpdates()
    : await requestLatest();
  cache = { at: Date.now(), value };
  return value;
}

export function desktopVersions(): { electron?: string; chrome?: string } {
  if (window.paperReader?.versions) return window.paperReader.versions;
  const chrome = navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1];
  return { chrome };
}

export const REPOSITORY_URL = `https://github.com/${REPO}`;
export const RELEASES_PAGE = RELEASES_URL;
