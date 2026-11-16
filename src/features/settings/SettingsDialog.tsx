import { useEffect, useRef, useState } from "react";
import { WinIcon } from "../../components/icons/WinIcon";
import { fetchModels, saveProviderConfig } from "../../lib/ai/client";
import { formatTokens } from "../../lib/tokens/estimate";
import { DEFAULT_PRICING } from "../../lib/tokens/meter";
import { clearAllLocalData } from "../../lib/storage/db";
import type { OcrModelId } from "../../lib/ocr/client";
import { useAssistant } from "../assistant/useAssistantStore";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useOcr } from "../ocr/useOcrStore";
import { ColorModeControl } from "../viewer/ColorModeControl";
import { useViewer } from "../viewer/useViewerStore";
import styles from "../../components/Modal.module.css";

type Props = { open: boolean; onClose: () => void };

const NAV = [
  { id: "model", label: "模型服务", glyph: "globe" },
  { id: "interface", label: "界面", glyph: "page" },
  { id: "appearance", label: "阅读外观", glyph: "theme" },
  { id: "conversation", label: "对话", glyph: "send" },
  { id: "ocr", label: "扫描件 OCR", glyph: "search" },
  { id: "privacy", label: "数据与隐私", glyph: "page" },
  { id: "about", label: "关于", glyph: "info" },
] as const;

const SECTION_GROUP: Record<string, string> = {
  model: "model",
  interface: "interface",
  appearance: "appearance",
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
  return [...new Set(value.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean))];
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
    void refreshOcrStatus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, refreshOcrStatus]);

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
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    try {
      await setOcrModel(id);
      const installed = ocrStatus?.availableModels?.find((item) => item.id === id)?.installed;
      if (!installed) await installOcr(id);
    } catch {
      // The store exposes the error in the section below.
    }
  };

  return (
    <div className={styles.backdrop} onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
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
            <WinIcon glyph="close" size={15} />
          </button>
        </div>
        <div className={styles.settingsBody}>
          <nav className={styles.settingsNav} aria-label="设置分类">
            {NAV.map((item) => (
              <button
                key={item.id}
                className={`${styles.settingsNavButton} ${activeNav === item.id ? styles.settingsNavActive : ""}`}
                onClick={() => goTo(item.id)}
                aria-current={activeNav === item.id ? "page" : undefined}
              >
                <WinIcon glyph={item.glyph} size={13} />
                {item.label}
              </button>
            ))}
            <div className={styles.settingsNavFoot}>
              偏好保存在本机 localStorage；模型服务密钥保存在本机代理的 <code>server/data</code>，不会进入前端 bundle。
            </div>
          </nav>
          <div className={styles.settingsContent} ref={contentRef} onScroll={onContentScroll}>
            <section className={styles.section} data-settings-section="model">
              <div className={styles.sectionTitle}>
                <WinIcon glyph="globe" size={13} />
                模型服务
                <span className={`${styles.badge} ${config?.mock ? styles.badgeWarn : styles.badgeOk}`}>
                  {config?.mock ? "本地 mock" : config?.hasKey ? "已连接配置" : "缺少密钥"}
                </span>
              </div>

              <div className={styles.presetRow}>
                <span>快速预设</span>
                <button className={styles.preset} onClick={() => applyPreset("deepseek")}>DeepSeek</button>
                <button className={styles.preset} onClick={() => applyPreset("openai")}>OpenAI 兼容</button>
                <button className={styles.preset} onClick={() => applyPreset("ollama")}>本地 Ollama</button>
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
                    密钥写入本机 <code>server/data/provider.json</code>（已 gitignore），不会返回给浏览器。
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
                <div className={styles.result} style={{ color: testError ? "var(--danger)" : "var(--muted)" }}>
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
                  <span className={styles.value}>{formatTokens(config?.contextWindow ?? 1_000_000)}</span>
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
                <WinIcon glyph="theme" size={13} />
                阅读外观
              </div>
              <ColorModeControl />
              <div className={styles.note}>
                色彩模式只改变本机页面的显示方式，不修改 PDF 文件。智能暗色自动识别纸面，深色封面与彩色照片保留原样；强度控制与原色的混合比例。缩略图保持原色。
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
                思考强度映射 DeepSeek 的 <code>reasoning_effort</code>；关闭更快更省。上下文预算是软限制，只影响超限提示、token 圆环与阅读建议，不阻止发送；真正的硬上限是模型 1M 上下文。对话历史窗口会把更早的消息折叠掉，避免长会话无限增长。
              </div>
            </section>

            <section className={styles.section} data-settings-section="ocr">
              <div className={styles.sectionTitle}>
                <WinIcon glyph="search" size={13} />
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
              <div className={styles.note}>
                当前页没有文字层时，会在后台自动识别；模型首次使用自动准备，不弹窗。行级 OCR
                文本可拖选、复制、高亮、引用和搜索，并在页面、侧栏和上下文里标注 OCR。
                识别在本机代理的 worker 线程完成，图片不上传云端。tiny 随桌面版分发，small /
                medium 按需下载。
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
            </section>

            <section className={styles.section} data-settings-section="privacy">
              <div className={styles.sectionTitle}>
                <WinIcon glyph="page" size={13} />
                隐私
              </div>
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.label}>主 PDF</span>
                  <span className={styles.value}>只在浏览器本地解析，不上传</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>发送内容</span>
                  <span className={styles.value}>仅你选中的页码、文字、截图与附件</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>密钥</span>
                  <span className={styles.value}>只存本机代理，不进入前端 bundle</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>传输</span>
                  <span className={styles.value}>默认只监听 127.0.0.1；云端内容受 provider 条款约束</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>本地记录</span>
                  <span className={styles.value}>阅读位置、对话、高亮与 OCR 文本保存在 IndexedDB</span>
                </div>
              </div>
              <div className={styles.note}>
                本地 IndexedDB 未加密；共用电脑时可使用下方“清空所有本地数据”。完全离线可把 Base URL 指向本机 Ollama 等 OpenAI 兼容端点。
              </div>
            </section>

            <section className={styles.section} data-settings-section="data">
              <div className={styles.sectionTitle}>
                <WinIcon glyph="clear" size={13} />
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
                <WinIcon glyph="info" size={13} />
                关于
              </div>
              <div className={styles.aboutGrid}>
                <div>
                  <strong>纸间 · PDF × AI 阅读器</strong>
                  <p>本地优先的 PDF 阅读器与 AI 阅读助手。主 PDF 不上传，只发送明确选中的内容。</p>
                </div>
                <div className={styles.aboutMeta}>
                  <span>版本 0.1.0</span>
                  <span>pdf.js 6.5.438</span>
                  <span>React 19 · Vite 8</span>
                  <span>MIT License</span>
                </div>
              </div>
              <div className={styles.note}>
                图标来自 lobe-icons（MIT）、Segoe Fluent Icons 与 Lucide（ISC）；状态图标使用 Morphicons（MIT）。
                PDF 内容视为不可信输入，模型不会执行文档中的指令。第三方模型服务由其各自条款约束。
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
