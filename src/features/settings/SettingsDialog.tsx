import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "../../components/icons/Icon";
import { BrandMark } from "../../components/icons/SparkleIcon";
import { copyText } from "../../lib/clipboard";
import {
  checkForUpdates,
  desktopVersions,
  isPrerelease,
  RELEASES_PAGE,
  REPOSITORY_URL,
  type UpdateInfo,
} from "../../lib/update";
import { fetchModels, saveProviderConfig } from "../../lib/ai/client";
import { formatTokens } from "../../lib/tokens/estimate";
import { DEFAULT_PRICING } from "../../lib/tokens/meter";
import { clearAllLocalData } from "../../lib/storage/db";
import {
  fetchOcrSource,
  resetOcrSource,
  saveOcrSource,
  testOcrSource,
  type OcrModelId,
  type OcrModelInfo,
  type OcrSourceInfo,
} from "../../lib/ocr/client";
import { useAssistant } from "../assistant/useAssistantStore";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useOcr } from "../ocr/useOcrStore";
import { ColorModeControl } from "../viewer/ColorModeControl";
import { useViewer } from "../viewer/useViewerStore";
import styles from "../../components/Modal.module.css";

type Props = { open: boolean; onClose: () => void };

const NAV = [
  { id: "model", label: "模型服务", glyph: "globe", target: "model" },
  { id: "reading", label: "阅读", glyph: "page", target: "interface" },
  { id: "conversation", label: "对话", glyph: "send", target: "conversation" },
  { id: "ocr", label: "扫描件 OCR", glyph: "search", target: "ocr" },
  { id: "privacy", label: "隐私与数据", glyph: "lock", target: "privacy" },
  { id: "about", label: "关于", glyph: "info", target: "about" },
] as const;

const SECTION_GROUP: Record<string, string> = {
  model: "model",
  interface: "reading",
  appearance: "reading",
  conversation: "conversation",
  ocr: "ocr",
  privacy: "privacy",
  data: "privacy",
  about: "about",
};

const SHORTCUTS: Array<[string, string]> = [
  ["Ctrl + J", "打开 / 最小化助手"],
  ["Alt + J", "关闭助手"],
  ["Ctrl + K", "聚焦提问框"],
  ["Ctrl + O", "打开 PDF"],
  ["Ctrl + F", "全文搜索"],
  ["PageUp / PageDown", "上一页 / 下一页"],
  ["+ / − / 0", "放大 / 缩小 / 100%"],
  ["Shift + D", "循环色彩模式"],
  ["Ctrl + Alt + S", "截取当前页"],
  ["Ctrl + Alt + R", "框选截图"],
  ["Ctrl + Alt + Q", "把选中文字加入上下文"],
  ["Esc", "分层关闭浮层"],
];

function splitModels(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SettingsDialog({ open, onClose }: Props) {
  const config = useAssistant((state) => state.config);
  const configError = useAssistant((state) => state.configError);
  const model = useAssistant((state) => state.model);
  const mode = useAssistant((state) => state.mode);
  const setMode = useAssistant((state) => state.setMode);
  const refreshConfig = useAssistant((state) => state.refreshConfig);
  const ocrStatus = useOcr((state) => state.status);
  const ocrError = useOcr((state) => state.error);
  const ocrInstalling = useOcr((state) => state.installing);
  const ocrEnabled = useOcr((state) => state.enabled);
  const setOcrEnabled = useOcr((state) => state.setEnabled);
  const thinking = useAssistant((state) => state.thinking);
  const setThinking = useAssistant((state) => state.setThinking);
  const contextBudget = useAssistant((state) => state.budget);
  const setContextBudget = useAssistant((state) => state.setContextBudget);
  const historyLimit = useAssistant((state) => state.historyLimit);
  const setHistoryLimit = useAssistant((state) => state.setHistoryLimit);
  const pricing = useAssistant((state) => state.pricing);
  const setPricing = useAssistant((state) => state.setPricing);
  const refreshOcrStatus = useOcr((state) => state.refreshStatus);
  const installOcr = useOcr((state) => state.install);
  const setOcrModel = useOcr((state) => state.setModel);
  const clearAll = useAssistant((state) => state.clearAll);
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef, open);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [testError, setTestError] = useState(false);
  const [providerResult, setProviderResult] = useState("");
  const [providerError, setProviderError] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [allowDraft, setAllowDraft] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [pricingDraft, setPricingDraft] = useState(DEFAULT_PRICING);
  const [confirmClear, setConfirmClear] = useState(false);
  const [privacyDoc, setPrivacyDoc] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState("");
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [pdfjsVersion, setPdfjsVersion] = useState("—");
  const [pendingModel, setPendingModel] = useState<OcrModelInfo | null>(null);
  const [sourceInfo, setSourceInfo] = useState<OcrSourceInfo | null>(null);
  const [sourceMode, setSourceMode] = useState<"default" | "custom">("default");
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceVerified, setSourceVerified] = useState(false);
  const [sourceMessage, setSourceMessage] = useState("");
  const [sourceError, setSourceError] = useState(false);
  const docName = useViewer((state) => state.docName);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollLock = useRef(0);
  const [activeNav, setActiveNav] = useState<string>("model");

  useEffect(() => {
    if (!open) return;
    const content = contentRef.current;
    if (content) content.scrollTop = 0;
    setActiveNav("model");
    setProviderResult("");
    setProviderError(false);
    setTestResult("");
    setTestError(false);
    setApiKey("");
    setClearKey(false);
    setConfirmClear(false);
    setUpdateInfo(null);
    setUpdateError("");
    setCheckingUpdate(false);
    setDiagnosticsCopied(false);
    setPendingModel(null);
    void import("pdfjs-dist")
      .then((module) => setPdfjsVersion(module.version))
      .catch(() => undefined);
    setSourceMessage("");
    setSourceError(false);
    setSourceVerified(false);
    void fetchOcrSource()
      .then((info) => {
        setSourceInfo(info);
        setSourceDraft(info.customBaseUrl ?? "");
        setSourceMode(info.customBaseUrl ? "custom" : "default");
      })
      .catch(() => undefined);
    void refreshOcrStatus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (privacyDoc) {
          setPrivacyDoc(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, refreshOcrStatus, privacyDoc]);

  useEffect(() => {
    if (!open || !config) return;
    setBaseUrl(config.baseUrl ?? "");
    setModelDraft(config.model);
    setAllowDraft((config.modelAllow ?? []).join(", "));
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    setPricingDraft(pricing);
  }, [open, pricing]);

  if (!open) return null;

  const goTo = (id: string) => {
    const content = contentRef.current;
    const section = content?.querySelector<HTMLElement>(`[data-settings-section="${id}"]`);
    section?.scrollIntoView({ behavior: "auto", block: "start" });
    setActiveNav(id);
    scrollLock.current = Date.now() + 550;
  };

  const onContentScroll = () => {
    if (Date.now() < scrollLock.current) return;
    const content = contentRef.current;
    if (!content) return;
    const sections = [...content.querySelectorAll<HTMLElement>("[data-settings-section]")];
    if (!sections.length) return;
    const edge = content.getBoundingClientRect().top + 24;
    let current = sections[0].dataset.settingsSection ?? "model";
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= edge) {
        current = section.dataset.settingsSection ?? current;
      }
    }
    setActiveNav(SECTION_GROUP[current] ?? current);
  };

  const test = async () => {
    setTesting(true);
    setTestError(false);
    setTestResult("");
    try {
      const list = await fetchModels();
      setTestResult(
        list.length
          ? `连接成功，可用模型 ${list.length} 个：${list.slice(0, 8).join("、")}${list.length > 8 ? "…" : ""}`
          : "连接成功，但服务端没有返回模型列表。",
      );
    } catch (error) {
      setTestError(true);
      setTestResult(error instanceof Error ? error.message : "连接失败");
    } finally {
      setTesting(false);
    }
  };

  const saveProvider = async () => {
    setSavingProvider(true);
    setProviderResult("");
    setProviderError(false);
    try {
      await saveProviderConfig({
        baseUrl: baseUrl.trim(),
        model: modelDraft.trim(),
        modelAllow: splitModels(allowDraft),
        apiKey: apiKey.trim() || undefined,
        clearKey,
      });
      await refreshConfig();
      setApiKey("");
      setClearKey(false);
      setProviderResult("模型服务配置已保存，新的请求会立即生效。");
    } catch (error) {
      setProviderError(true);
      setProviderResult(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSavingProvider(false);
    }
  };

  const applyPreset = (preset: "deepseek" | "openai" | "ollama") => {
    if (preset === "deepseek") {
      setBaseUrl("https://api.deepseek.com");
      setModelDraft("deepseek-flash");
      setAllowDraft("deepseek-flash, deepseek-v4-pro");
    } else if (preset === "openai") {
      setBaseUrl("https://api.openai.com/v1");
      setModelDraft("gpt-4o-mini");
      setAllowDraft("gpt-4o-mini");
    } else {
      setBaseUrl("http://127.0.0.1:11434/v1");
      setModelDraft("qwen2.5vl:7b");
      setAllowDraft("qwen2.5vl:7b");
    }
    setProviderResult("");
    setProviderError(false);
  };

  const savePricing = () => {
    setPricing({
      inputMiss: Number(pricingDraft.inputMiss) || 0,
      inputHit: Number(pricingDraft.inputHit) || 0,
      output: Number(pricingDraft.output) || 0,
    });
  };

  const chooseOcrModel = async (id: OcrModelId) => {
    const info = ocrStatus?.availableModels?.find((item) => item.id === id);
    if (info && !info.installed) {
      setPendingModel(info);
      return;
    }
    setPendingModel(null);
    try {
      await setOcrModel(id);
      await refreshOcrStatus();
    } catch {
      // The store exposes the error in the section below.
    }
  };

  const confirmOcrModel = async () => {
    if (!pendingModel) return;
    const id = pendingModel.id;
    setPendingModel(null);
    try {
      await installOcr(id);
      await setOcrModel(id);
      await refreshOcrStatus();
    } catch {
      // Keep the previous active model; the store shows the download error.
    }
  };

  const testSource = async () => {
    if (!sourceDraft.trim()) {
      setSourceError(true);
      setSourceMessage("请输入镜像根地址");
      return;
    }
    setSourceBusy(true);
    setSourceMessage("");
    setSourceError(false);
    setSourceVerified(false);
    try {
      const result = await testOcrSource(sourceDraft, ocrStatus?.activeModel);
      setSourceVerified(result.ok);
      setSourceError(!result.ok);
      setSourceMessage(
        result.ok
          ? `3 个文件均可访问（${result.baseUrl}）`
          : result.files
              .filter((file) => !file.ok)
              .map((file) => `${file.name}: ${file.error ?? "不可用"}`)
              .join(" · "),
      );
    } catch (error) {
      setSourceError(true);
      setSourceMessage(error instanceof Error ? error.message : "测试失败");
    } finally {
      setSourceBusy(false);
    }
  };

  const saveSource = async () => {
    if (!sourceVerified) {
      setSourceError(true);
      setSourceMessage("请先测试连接，全部通过后再保存。");
      return;
    }
    setSourceBusy(true);
    try {
      const info = await saveOcrSource(sourceDraft);
      setSourceInfo(info);
      setSourceMode("custom");
      setSourceError(false);
      setSourceMessage("镜像已保存，下一次下载会立即使用。");
      setSourceVerified(false);
    } catch (error) {
      setSourceError(true);
      setSourceMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSourceBusy(false);
    }
  };

  const restoreDefaultSource = async () => {
    setSourceBusy(true);
    try {
      const info = await resetOcrSource();
      setSourceInfo(info);
      setSourceMode("default");
      setSourceDraft("");
      setSourceVerified(false);
      setSourceMessage("已恢复官方下载源。");
      setSourceError(false);
    } catch (error) {
      setSourceError(true);
      setSourceMessage(error instanceof Error ? error.message : "恢复默认失败");
    } finally {
      setSourceBusy(false);
    }
  };

  const openPrivacyDoc = async () => {
    const module = await import("../../../docs/PRIVACY.md?raw");
    setPrivacyDoc(module.default);
  };

  const checkUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateError("");
    setUpdateInfo(null);
    try {
      setUpdateInfo(await checkForUpdates(true));
    } catch (error) {
      const message = error instanceof Error ? error.message : "检查更新失败，请重试。";
      setUpdateError(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""));
    } finally {
      setCheckingUpdate(false);
    }
  };

  const copyDiagnostics = async () => {
    const versions = desktopVersions();
    let providerHost = "—";
    try {
      providerHost = config?.baseUrl ? new URL(config.baseUrl).host : "—";
    } catch {
      providerHost = config?.baseUrl || "—";
    }
    const lines = [
      `纸间 ${__APP_VERSION__} (${__GIT_SHA__}, ${__BUILD_DATE__})`,
      `平台 ${navigator.platform || "—"}`,
      `Electron ${versions.electron ?? "—"} · Chromium ${versions.chrome ?? "—"}`,
      `PDF.js ${pdfjsVersion}`,
      `Provider ${providerHost}`,
      `模型 ${model || "—"}`,
      `OCR ${ocrStatus?.activeModel ?? "—"}`,
    ];
    const ok = await copyText(lines.join("\n"));
    setDiagnosticsCopied(ok);
  };

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={cardRef}
        className={`${styles.card} ${styles.settingsCard}`}
        role="dialog"
        aria-modal="true"
        aria-label="设置"
      >
        <div className={styles.head}>
          <span className={styles.title}>设置</span>
          <span className={styles.headSpacer} />
          <button className={styles.close} onClick={onClose} aria-label="关闭设置">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className={styles.settingsBody}>
          <nav className={styles.settingsNav} aria-label="设置分类">
            {NAV.map((item) => (
              <button
                key={item.id}
                className={`${styles.settingsNavButton} ${activeNav === item.id ? styles.settingsNavActive : ""}`}
                onClick={() => goTo(item.target)}
                aria-current={activeNav === item.id ? "page" : undefined}
              >
                <Icon name={item.glyph} size={16} />
                {item.label}
              </button>
            ))}
            <div className={styles.settingsNavFoot}>
              偏好保存在本机 localStorage；模型服务密钥保存在本机代理的 <code>server/data</code>
              ，不会进入前端 bundle。
            </div>
          </nav>
          <div
            className={styles.settingsContent}
            ref={contentRef}
            onScroll={onContentScroll}
            tabIndex={0}
            aria-label="设置内容"
          >
            <section className={styles.section} data-settings-section="model">
              <div className={styles.sectionTitle}>
                <Icon name="globe" size={16} />
                模型服务
                <span
                  className={`${styles.badge} ${config?.mock ? styles.badgeWarn : styles.badgeOk}`}
                >
                  {config?.mock ? "本地 mock" : config?.hasKey ? "已连接配置" : "缺少密钥"}
                </span>
              </div>

              <div className={styles.presetRow}>
                <span>快速预设</span>
                <button className={styles.preset} onClick={() => applyPreset("deepseek")}>
                  DeepSeek
                </button>
                <button className={styles.preset} onClick={() => applyPreset("openai")}>
                  OpenAI 兼容
                </button>
                <button className={styles.preset} onClick={() => applyPreset("ollama")}>
                  本地 Ollama
                </button>
              </div>

              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Base URL</span>
                  <input
                    className={styles.input}
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="https://api.deepseek.com"
                    spellCheck={false}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>默认模型</span>
                  <input
                    className={styles.input}
                    value={modelDraft}
                    onChange={(event) => setModelDraft(event.target.value)}
                    placeholder="deepseek-flash"
                    spellCheck={false}
                  />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>API Key</span>
                  <input
                    className={styles.input}
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={
                      config?.hasKey
                        ? `已配置${config.keyHint ? ` · 尾号 ${config.keyHint}` : ""}，留空保持不变`
                        : "sk-…（只在本地代理保存）"
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <span className={styles.fieldHint}>
                    密钥写入本机 <code>server/data/provider.json</code>（已
                    gitignore），不会返回给浏览器。
                  </span>
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>允许切换的模型</span>
                  <input
                    className={styles.input}
                    value={allowDraft}
                    onChange={(event) => setAllowDraft(event.target.value)}
                    placeholder="deepseek-flash, deepseek-v4-pro"
                    spellCheck={false}
                  />
                  <span className={styles.fieldHint}>逗号分隔；留空时只允许默认模型。</span>
                </label>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={clearKey}
                    onChange={(event) => setClearKey(event.target.checked)}
                  />
                  清除已保存的 API Key
                </label>
              </div>

              <div className={styles.actions}>
                <button
                  className={`${styles.button} ${styles.primary}`}
                  onClick={() => void saveProvider()}
                  disabled={savingProvider}
                >
                  {savingProvider ? "保存中…" : "保存模型服务"}
                </button>
                <button className={styles.button} onClick={() => void test()} disabled={testing}>
                  {testing ? "正在连接…" : "测试当前配置"}
                </button>
              </div>
              {providerResult ? (
                <div className={`${styles.result} ${providerError ? styles.bad : styles.ok}`}>
                  {providerResult}
                </div>
              ) : null}
              {testResult ? (
                <div
                  className={styles.result}
                  style={{ color: testError ? "var(--danger)" : "var(--muted)" }}
                >
                  {testResult}
                </div>
              ) : null}
              {configError ? <div className={styles.result}>{configError}</div> : null}

              <div className={styles.divider} />
              <div className={styles.subhead}>运行信息</div>
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.label}>当前模型</span>
                  <span className={styles.value}>{model}</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>端点</span>
                  <span className={styles.value}>{config?.baseUrlHost ?? "—"}</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>上下文窗口</span>
                  <span className={styles.value}>
                    {formatTokens(config?.contextWindow ?? 1_000_000)}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>服务端预算</span>
                  <span className={styles.value}>
                    输入 {formatTokens(config?.budget.input ?? 1_000_000)} · 输出{" "}
                    {formatTokens(config?.budget.output ?? 8_000)}
                  </span>
                </div>
              </div>

              <div className={styles.divider} />
              <div className={styles.subhead}>费用单价（估算）</div>
              <div className={styles.priceGrid}>
                {(
                  [
                    ["inputMiss", "未命中输入"],
                    ["inputHit", "缓存命中输入"],
                    ["output", "输出"],
                  ] as const
                ).map(([key, label]) => (
                  <label className={styles.field} key={key}>
                    <span className={styles.fieldLabel}>{label} · 元 / 百万 token</span>
                    <input
                      className={styles.input}
                      type="number"
                      min="0"
                      step="0.01"
                      value={pricingDraft[key]}
                      onChange={(event) =>
                        setPricingDraft((prev) => ({
                          ...prev,
                          [key]: Number(event.target.value) || 0,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <div className={styles.actions}>
                <button className={styles.button} onClick={savePricing}>
                  保存单价
                </button>
                <span className={styles.fieldHint}>
                  只影响本地费用估算；实际费用以 provider 返回的 usage 为准。
                </span>
              </div>
            </section>

            <section className={styles.section} data-settings-section="interface">
              <div className={styles.sectionTitle}>界面</div>
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.label}>助手形态</span>
                  <span className={styles.segmented}>
                    <button
                      className={`${styles.segment} ${mode === "float" ? styles.segmentActive : ""}`}
                      onClick={() => setMode("float")}
                      aria-pressed={mode === "float"}
                    >
                      悬浮窗
                    </button>
                    <button
                      className={`${styles.segment} ${mode === "sidebar" ? styles.segmentActive : ""}`}
                      onClick={() => setMode("sidebar")}
                      aria-pressed={mode === "sidebar"}
                    >
                      侧边栏
                    </button>
                  </span>
                </div>
              </div>
              <div className={styles.note}>
                悬浮窗覆盖在阅读区上，可拖动、四边与四角缩放；侧边栏停靠右侧，阅读区自动让位，拖左缘可调宽度。窗口较窄时会自动切换为底部面板。
              </div>
              <details className={styles.details}>
                <summary>快捷键一览</summary>
                <div className={styles.shortcutGrid}>
                  {SHORTCUTS.map(([keys, action]) => (
                    <div className={styles.shortcut} key={keys}>
                      <kbd>{keys}</kbd>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </details>
            </section>

            <section className={styles.section} data-settings-section="appearance">
              <div className={styles.sectionTitle}>
                <Icon name="theme" size={16} />
                阅读外观
              </div>
              <ColorModeControl />
              <div className={styles.note}>
                色彩模式只改变本机页面的显示方式，不修改 PDF
                文件。智能暗色自动识别纸面，深色封面与彩色照片保留原样；强度控制与原色的混合比例。缩略图保持原色。
              </div>
            </section>

            <section className={styles.section} data-settings-section="conversation">
              <div className={styles.sectionTitle}>对话</div>
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.label}>思考强度</span>
                  <span className={styles.segmented}>
                    {(
                      [
                        ["none", "关闭"],
                        ["low", "低"],
                        ["high", "高"],
                        ["max", "最高"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        className={`${styles.segment} ${thinking === value ? styles.segmentActive : ""}`}
                        onClick={() => setThinking(value)}
                        aria-pressed={thinking === value}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>上下文预算</span>
                  <span className={styles.segmented}>
                    {[32, 128, 256, 512, 1000].map((value) => (
                      <button
                        key={value}
                        className={`${styles.segment} ${contextBudget === value * 1000 ? styles.segmentActive : ""}`}
                        onClick={() => setContextBudget(value * 1000)}
                        aria-pressed={contextBudget === value * 1000}
                      >
                        {value === 1000 ? "1M" : `${value}k`}
                      </button>
                    ))}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>对话历史窗口</span>
                  <span className={styles.segmented}>
                    {[
                      [10, "10 条"],
                      [20, "20 条"],
                      [40, "40 条"],
                      [80, "80 条"],
                      [0, "不限"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={`${styles.segment} ${historyLimit === value ? styles.segmentActive : ""}`}
                        onClick={() => setHistoryLimit(Number(value))}
                        aria-pressed={historyLimit === value}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                </div>
              </div>
              <div className={styles.note}>
                思考强度映射 DeepSeek 的 <code>reasoning_effort</code>
                ；关闭更快更省。上下文预算是软限制，只影响超限提示、token
                圆环与阅读建议，不阻止发送；真正的硬上限是模型 1M
                上下文。对话历史窗口会把更早的消息折叠掉，避免长会话无限增长。
              </div>
            </section>

            <section className={styles.section} data-settings-section="ocr">
              <div className={styles.sectionTitle}>
                <Icon name="search" size={16} />
                扫描件 OCR
              </div>
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.label}>模型</span>
                  <span className={styles.value}>{ocrStatus?.model ?? "正在检查…"}</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>状态</span>
                  <span
                    className={`${styles.value} ${
                      ocrStatus?.installed ? styles.ok : ocrStatus?.downloading ? styles.warn : ""
                    }`}
                  >
                    {ocrStatus?.downloading
                      ? `下载中 ${Math.round((ocrStatus.progress ?? 0) * 100)}%`
                      : ocrStatus?.installed
                        ? "已安装"
                        : ocrStatus
                          ? "未下载"
                          : "正在检查…"}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>OCR 文本层</span>
                  <span className={styles.value}>
                    <button
                      className={`${styles.segment} ${ocrEnabled ? styles.segmentActive : ""}`}
                      onClick={() => setOcrEnabled(!ocrEnabled)}
                    >
                      {ocrEnabled ? "已开启" : "已关闭"}
                    </button>
                  </span>
                </div>
              </div>
              <div className={styles.note}>
                当前：
                {(() => {
                  const active = ocrStatus?.availableModels?.find(
                    (item) => item.id === ocrStatus.activeModel,
                  );
                  return active
                    ? `${active.label} · ${active.installed ? "已安装" : "未下载"}`
                    : (ocrStatus?.model ?? "正在检查…");
                })()}
                。切换未下载的模型会先询问，不会自动开始下载。
              </div>
              <div className={styles.segmented} style={{ margin: "10px 0 2px" }}>
                {(ocrStatus?.availableModels ?? []).map((item) => (
                  <button
                    key={item.id}
                    className={`${styles.segment} ${
                      ocrStatus?.activeModel === item.id ? styles.segmentActive : ""
                    }`}
                    onClick={() => void chooseOcrModel(item.id)}
                    disabled={ocrInstalling || item.downloading}
                    title={`${item.note} 约 ${mb(item.approxBytes)}`}
                  >
                    {item.label.replace("PP-OCRv6 ", "")}
                    {item.downloading ? ` ${Math.round(item.progress * 100)}%` : ""}
                  </button>
                ))}
              </div>
              {pendingModel ? (
                <div className={styles.result}>
                  {pendingModel.label} 尚未下载，约 {mb(pendingModel.approxBytes)}
                  。是否现在下载并切换？
                  <button className={styles.linkButton} onClick={() => void confirmOcrModel()}>
                    下载并切换
                  </button>
                  <button className={styles.linkButton} onClick={() => setPendingModel(null)}>
                    取消
                  </button>
                </div>
              ) : null}
              <div className={styles.note}>
                当前页没有文字层时会在后台自动识别，不弹窗、不打断阅读。行级 OCR
                文本可拖选、复制、高亮、引用和搜索；识别在本机代理的 worker
                线程完成，图片不上传云端。
              </div>
              <div className={styles.actions}>
                {!ocrStatus?.installed ? (
                  <button
                    className={`${styles.button} ${styles.primary}`}
                    onClick={() => {
                      // The store exposes the failure through `ocrError`; do not
                      // let a rejected install become an unhandled rejection.
                      void installOcr(ocrStatus?.activeModel).catch(() => undefined);
                    }}
                    disabled={Boolean(ocrStatus?.downloading) || ocrInstalling}
                  >
                    {ocrStatus?.downloading || ocrInstalling ? "正在下载…" : "下载当前模型"}
                  </button>
                ) : (
                  <button className={styles.button} onClick={() => void refreshOcrStatus()}>
                    重新检查
                  </button>
                )}
              </div>
              {ocrError ? <div className={styles.result}>{ocrError}</div> : null}

              <div className={styles.rows} style={{ marginTop: 14 }}>
                <div className={styles.row}>
                  <span className={styles.label}>下载源</span>
                  <span className={styles.segmented}>
                    <button
                      className={`${styles.segment} ${sourceMode === "default" ? styles.segmentActive : ""}`}
                      onClick={() => setSourceMode("default")}
                    >
                      默认（官方）
                    </button>
                    <button
                      className={`${styles.segment} ${sourceMode === "custom" ? styles.segmentActive : ""}`}
                      onClick={() => setSourceMode("custom")}
                    >
                      自定义镜像
                    </button>
                  </span>
                </div>
              </div>
              {sourceMode === "custom" ? (
                <div className={styles.field} style={{ marginTop: 8 }}>
                  <span className={styles.fieldLabel}>镜像根地址（保持官方目录结构）</span>
                  <input
                    className={styles.input}
                    value={sourceDraft}
                    onChange={(event) => {
                      setSourceDraft(event.target.value);
                      setSourceVerified(false);
                    }}
                    placeholder="https://mirror.example.com/ppocrv6"
                    spellCheck={false}
                  />
                  <div className={styles.actions}>
                    <button
                      className={styles.button}
                      onClick={() => void testSource()}
                      disabled={sourceBusy}
                    >
                      {sourceBusy ? "处理中…" : "测试连接"}
                    </button>
                    <button
                      className={`${styles.button} ${styles.primary}`}
                      onClick={() => void saveSource()}
                      disabled={sourceBusy || !sourceVerified}
                    >
                      保存
                    </button>
                    <button
                      className={styles.button}
                      onClick={() => void restoreDefaultSource()}
                      disabled={sourceBusy}
                    >
                      恢复默认
                    </button>
                  </div>
                  {sourceInfo?.customBaseUrl ? (
                    <details className={styles.thirdParty}>
                      <summary>已保存镜像的文件 URL</summary>
                      <ul>
                        {(
                          sourceInfo.models.find(
                            (item) => item.id === (ocrStatus?.activeModel ?? "v6-tiny"),
                          )?.files ?? []
                        ).map((file) => (
                          <li key={file.name}>
                            <code>{file.url}</code>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : (
                <div className={styles.note}>使用官方 GitHub Releases / HuggingFace 下载源。</div>
              )}
              {sourceMessage ? (
                <div className={styles.result} data-source-error={sourceError || undefined}>
                  {sourceMessage}
                </div>
              ) : null}
            </section>

            <section className={styles.section} data-settings-section="privacy">
              <div className={styles.sectionTitle}>
                <Icon name="lock" size={16} />
                隐私与数据
              </div>
              <p className={styles.sectionLead}>
                PDF 不离开本机；只有你选中的内容会发给模型。没有遥测，也没有后台统计上报。
              </p>
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.label}>主 PDF</span>
                  <span className={styles.value}>浏览器本地解析，不上传</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>发送给模型</span>
                  <span className={styles.value}>
                    页码文本、选中文字、截图、附件与引用；不发送整份 PDF
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>本地记录</span>
                  <span className={styles.value}>
                    阅读位置、对话、高亮、OCR 文本与最近文档（单文件 ≤24MB，总计 ≤64MB，最多 8 条）
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>密钥</span>
                  <span className={styles.value}>只存本机代理，不进入前端 bundle</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>网络请求</span>
                  <span className={styles.value}>
                    AI provider、OCR 模型下载、手动检查更新；不访问其他服务
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>云端保留</span>
                  <span className={styles.value}>由 provider 条款决定</span>
                </div>
              </div>
              <div className={styles.note}>
                本地 IndexedDB 未加密；共用电脑时可清空所有本地数据。代理默认只监听 127.0.0.1。
              </div>
              <div className={styles.actions}>
                <button className={styles.linkButton} onClick={() => void openPrivacyDoc()}>
                  查看完整隐私说明 →
                </button>
              </div>
            </section>

            <section className={styles.section} data-settings-section="data">
              <div className={styles.sectionTitle}>
                <Icon name="clear" size={16} />
                数据
              </div>
              <div className={styles.note} style={{ marginTop: 0 }}>
                {docName ? `当前文档：${docName}` : "尚未打开文档"}。清空对话不会修改 PDF。
              </div>
              <div className={styles.actions}>
                <button
                  className={`${styles.button} ${styles.danger}`}
                  onClick={() => {
                    clearAll();
                    onClose();
                  }}
                >
                  清空本篇对话与上下文
                </button>
                <button
                  className={`${styles.button} ${styles.danger}`}
                  onClick={() => {
                    if (!confirmClear) {
                      setConfirmClear(true);
                      return;
                    }
                    void clearAllLocalData();
                  }}
                >
                  {confirmClear ? "再次点击确认清空所有本地数据" : "清空所有本地数据"}
                </button>
              </div>
              {confirmClear ? (
                <div className={styles.result}>
                  这会删除所有文档记录、对话、高亮、OCR 与设置，但不会删除 PDF 文件；操作不可撤销。
                  <button className={styles.linkButton} onClick={() => setConfirmClear(false)}>
                    取消
                  </button>
                </div>
              ) : null}
            </section>

            <section className={styles.section} data-settings-section="about">
              <div className={styles.sectionTitle}>
                <Icon name="info" size={16} />
                关于
              </div>
              <div className={styles.aboutGrid}>
                <div className={styles.aboutBrand}>
                  <span className={styles.aboutMark}>
                    <BrandMark size={48} />
                  </span>
                  <div>
                    <strong>纸间</strong>
                    <p>本地优先的 PDF 阅读器与 AI 阅读助手。</p>
                  </div>
                </div>
                <div className={styles.aboutMeta}>
                  <span>
                    版本 {__APP_VERSION__} · {__GIT_SHA__} · {__BUILD_DATE__}
                  </span>
                  <span>
                    Electron {desktopVersions().electron ?? "—"} · Chromium{" "}
                    {desktopVersions().chrome ?? "—"}
                  </span>
                  <span>pdf.js {pdfjsVersion}</span>
                </div>
              </div>
              <div className={styles.actions}>
                <button
                  className={`${styles.button} ${styles.primary}`}
                  onClick={() => void checkUpdate()}
                  disabled={checkingUpdate}
                >
                  {checkingUpdate ? "检查中…" : "检查更新"}
                </button>
                <button className={styles.button} onClick={() => void copyDiagnostics()}>
                  {diagnosticsCopied ? "已复制" : "复制诊断信息"}
                </button>
                <a className={styles.button} href={REPOSITORY_URL} target="_blank" rel="noreferrer">
                  GitHub
                </a>
                <a
                  className={styles.button}
                  href={`${REPOSITORY_URL}/issues`}
                  target="_blank"
                  rel="noreferrer"
                >
                  问题反馈
                </a>
                <a
                  className={styles.button}
                  href={`${REPOSITORY_URL}/blob/main/SECURITY.md`}
                  target="_blank"
                  rel="noreferrer"
                >
                  安全策略
                </a>
                <a
                  className={styles.button}
                  href={`${REPOSITORY_URL}/blob/main/LICENSE`}
                  target="_blank"
                  rel="noreferrer"
                >
                  许可证
                </a>
              </div>
              {isPrerelease(__APP_VERSION__) ? (
                <div className={styles.note}>
                  你正在使用预发布版本，正式版发布后可直接覆盖安装。
                </div>
              ) : null}
              {updateInfo ? (
                <div className={styles.result}>
                  {updateInfo.hasUpdate
                    ? `发现新版本 ${updateInfo.latest}`
                    : `已是最新版本 ${updateInfo.current}`}
                  {updateInfo.publishedAt ? ` · ${updateInfo.publishedAt.slice(0, 10)}` : ""}
                  {updateInfo.hasUpdate ? (
                    <a
                      className={styles.linkButton}
                      href={updateInfo.url || RELEASES_PAGE}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开发布页
                    </a>
                  ) : null}
                </div>
              ) : null}
              {updateError ? <div className={styles.result}>{updateError}</div> : null}
              <div className={styles.note}>
                更新只在你点击时检查 GitHub Releases，不后台轮询、不自动下载或安装。主 PDF
                不上传；模型不会执行文档中的指令。第三方服务由其各自条款约束。
              </div>
              <details className={styles.thirdParty}>
                <summary>第三方声明</summary>
                <div>
                  运行时：Electron（MIT）、Chromium（BSD）、pdf.js（Apache-2.0）、React（MIT）、KaTeX（MIT）。
                </div>
                <div>
                  图标：Lucide（ISC）、lobe-icons（MIT）；品牌标记为自制。OCR：PP-OCRv6
                  （Apache-2.0）、ppu-paddle-ocr（MIT）、ONNX Runtime（MIT）。
                </div>
                <a
                  href={`${REPOSITORY_URL}/blob/main/THIRD_PARTY_NOTICES.md`}
                  target="_blank"
                  rel="noreferrer"
                >
                  完整第三方声明 →
                </a>
              </details>
            </section>
          </div>
        </div>
      </div>
      {privacyDoc ? (
        <div
          className={styles.docBackdrop}
          onPointerDown={(event) => event.target === event.currentTarget && setPrivacyDoc(null)}
        >
          <div className={styles.docCard} role="dialog" aria-modal="true" aria-label="隐私说明">
            <div className={styles.docHead}>
              <span className={styles.title}>隐私说明</span>
              <span className={styles.headSpacer} />
              <button
                className={styles.close}
                onClick={() => setPrivacyDoc(null)}
                aria-label="关闭隐私说明"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className={styles.docBody}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{privacyDoc}</ReactMarkdown>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
