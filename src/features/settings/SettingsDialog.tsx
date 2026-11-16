import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "../../components/icons/Icon";
import { fetchModels, saveProviderConfig } from "../../lib/ai/client";
import { formatTokens } from "../../lib/tokens/estimate";
import { DEFAULT_PRICING } from "../../lib/tokens/meter";
import { clearAllLocalData } from "../../lib/storage/db";
import { useAssistant } from "../assistant/useAssistantStore";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { ColorModeControl } from "../viewer/ColorModeControl";
import { useViewer } from "../viewer/useViewerStore";
import { useShortcutsStore } from "../shortcuts/useShortcutsStore";
import { SHORTCUT_ACTIONS, formatBindings } from "../../lib/shortcuts";
import { AboutSection } from "./sections/AboutSection";
import { OcrSection } from "./sections/OcrSection";
import styles from "../../components/Modal.module.css";

type Props = { open: boolean; onClose: () => void; onOpenShortcuts: () => void };

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

export function SettingsDialog({ open, onClose, onOpenShortcuts }: Props) {
  const config = useAssistant((state) => state.config);
  const configError = useAssistant((state) => state.configError);
  const model = useAssistant((state) => state.model);
  const mode = useAssistant((state) => state.mode);
  const setMode = useAssistant((state) => state.setMode);
  const refreshConfig = useAssistant((state) => state.refreshConfig);
  const thinking = useAssistant((state) => state.thinking);
  const setThinking = useAssistant((state) => state.setThinking);
  const contextBudget = useAssistant((state) => state.budget);
  const setContextBudget = useAssistant((state) => state.setContextBudget);
  const historyLimit = useAssistant((state) => state.historyLimit);
  const setHistoryLimit = useAssistant((state) => state.setHistoryLimit);
  const pricing = useAssistant((state) => state.pricing);
  const setPricing = useAssistant((state) => state.setPricing);
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
  const docName = useViewer((state) => state.docName);
  const shortcutBindings = useShortcutsStore((state) => state.bindings);
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
  }, [open, onClose, privacyDoc]);

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

  const openPrivacyDoc = async () => {
    const module = await import("../../../docs/PRIVACY.md?raw");
    setPrivacyDoc(module.default);
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
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.label}>快捷键</span>
                  <button className={styles.button} onClick={onOpenShortcuts}>
                    自定义快捷键
                  </button>
                </div>
              </div>
              <div className={styles.note}>
                单击任意组合键即可重新录制；也可以按 <kbd>?</kbd> 打开快捷键面板。
              </div>
              <details className={styles.details}>
                <summary>快捷键一览</summary>
                <div className={styles.shortcutGrid}>
                  {SHORTCUT_ACTIONS.map((action) => (
                    <div className={styles.shortcut} key={action.id}>
                      <kbd>{formatBindings(shortcutBindings[action.id] ?? action.defaults)}</kbd>
                      <span>{action.label}</span>
                    </div>
                  ))}
                  <div className={styles.shortcut}>
                    <kbd>Ctrl + 滚轮</kbd>
                    <span>以指针为中心缩放</span>
                  </div>
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

            <OcrSection />

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

            <AboutSection />
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
