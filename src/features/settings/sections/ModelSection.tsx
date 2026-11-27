import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/icons/Icon";
import { fetchModels, saveProviderConfig } from "../../../lib/ai/client";
import { DEFAULT_PRICING } from "../../../lib/tokens/meter";
import { useAssistant } from "../../assistant/useAssistantStore";
import styles from "../SettingsUI.module.css";

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

type ProviderKind = "deepseek" | "openai" | "ollama" | "custom";

const PRESETS: Record<
  Exclude<ProviderKind, "custom">,
  { baseUrl: string; model: string; allow: string }
> = {
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    allow: "deepseek-flash, deepseek-v4-pro",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    allow: "gpt-4o-mini",
  },
  ollama: {
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "qwen2.5vl:7b",
    allow: "qwen2.5vl:7b",
  },
};

function providerOf(baseUrl: string): { kind: ProviderKind; name: string; detail: string } {
  if (/api\.deepseek\.com/i.test(baseUrl)) {
    return { kind: "deepseek", name: "DeepSeek", detail: "官方 API" };
  }
  if (/api\.openai\.com/i.test(baseUrl)) {
    return { kind: "openai", name: "OpenAI 兼容", detail: "Chat Completions" };
  }
  if (/127\.0\.0\.1:11434|localhost:11434/i.test(baseUrl)) {
    return { kind: "ollama", name: "本地 Ollama", detail: "本机模型" };
  }
  return { kind: "custom", name: "自定义服务", detail: "OpenAI 兼容接口" };
}

function hostOf(baseUrl: string, fallback: string): string {
  try {
    return new URL(baseUrl).host || fallback;
  } catch {
    return fallback || baseUrl;
  }
}

export function ModelSection() {
  const config = useAssistant((state) => state.config);
  const configError = useAssistant((state) => state.configError);
  const refreshConfig = useAssistant((state) => state.refreshConfig);
  const pricing = useAssistant((state) => state.pricing);
  const setPricing = useAssistant((state) => state.setPricing);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [modelDraft, setModelDraft] = useState("");
  const [allowDraft, setAllowDraft] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const autoOpened = useRef(false);
  const [pricingDraft, setPricingDraft] = useState(DEFAULT_PRICING);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [result, setResult] = useState("");
  const [resultError, setResultError] = useState(false);

  useEffect(() => {
    if (!config) return;
    setBaseUrl(config.baseUrl ?? "");
    setModelDraft(config.model);
    setAllowDraft((config.modelAllow ?? []).join(", "));
    if (!autoOpened.current && !config.hasKey && !config.mock) {
      autoOpened.current = true;
      setEditorOpen(true);
    }
  }, [config]);

  useEffect(() => {
    setPricingDraft(pricing);
  }, [pricing]);

  const provider = useMemo(() => providerOf(baseUrl), [baseUrl]);
  const host = hostOf(baseUrl, config?.baseUrlHost ?? "");
  const local = /127\.0\.0\.1|localhost/i.test(baseUrl);
  const configured = Boolean(config?.hasKey) || local || Boolean(config?.mock);
  const dotClass = config?.mock
    ? styles.providerDotWarn
    : configured
      ? styles.providerDotOk
      : styles.providerDotMuted;
  const tag = config?.mock ? "本地演示" : local ? "本地" : config?.hasKey ? "已配置" : "未配置";

  const resetDraft = () => {
    if (!config) return;
    setBaseUrl(config.baseUrl ?? "");
    setModelDraft(config.model);
    setAllowDraft((config.modelAllow ?? []).join(", "));
    setApiKey("");
    setClearKey(false);
    setShowKey(false);
  };

  const closeEditor = () => {
    resetDraft();
    setEditorOpen(false);
    setResult("");
    setResultError(false);
  };

  const runTest = async () => {
    try {
      const list = await fetchModels();
      setResult(
        list.length
          ? `连接成功，可用模型 ${list.length} 个：${list.slice(0, 8).join("、")}${list.length > 8 ? "…" : ""}`
          : "连接成功，但服务端没有返回模型列表。",
      );
      setResultError(false);
    } catch (error) {
      setResultError(true);
      setResult(error instanceof Error ? error.message : "连接失败");
    }
  };

  const testConnection = async () => {
    setBusy("test");
    setResultError(false);
    setResult("");
    try {
      await runTest();
    } finally {
      setBusy(null);
    }
  };

  const saveProvider = async (testAfter: boolean) => {
    setBusy(testAfter ? "test" : "save");
    setResult("");
    setResultError(false);
    try {
      await saveProviderConfig({
        baseUrl: baseUrl.trim(),
        model: modelDraft.trim(),
        modelAllow: splitModels(allowDraft),
        apiKey: apiKey.trim() || undefined,
        clearKey,
      });
      const next = await refreshConfig();
      setApiKey("");
      setClearKey(false);
      setShowKey(false);
      if (next) {
        setBaseUrl(next.baseUrl ?? baseUrl);
        setModelDraft(next.model);
        setAllowDraft((next.modelAllow ?? []).join(", "));
      }
      setEditorOpen(false);
      if (testAfter) {
        await runTest();
      } else {
        setResult("模型服务配置已保存。");
      }
    } catch (error) {
      setResultError(true);
      setResult(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(null);
    }
  };

  const applyPreset = (preset: Exclude<ProviderKind, "custom">) => {
    const next = PRESETS[preset];
    setBaseUrl(next.baseUrl);
    setModelDraft(next.model);
    setAllowDraft(next.allow);
    setEditorOpen(true);
    setResult("");
    setResultError(false);
  };

  const savePricing = () => {
    setPricing({
      inputMiss: Number(pricingDraft.inputMiss) || 0,
      inputHit: Number(pricingDraft.inputHit) || 0,
      output: Number(pricingDraft.output) || 0,
    });
    setResult("费用单价已保存。");
    setResultError(false);
  };

  const badge = config?.mock ? "本地演示" : config?.hasKey ? "已配置" : "未配置";
  const badgeClass = config?.mock
    ? `${styles.statusPill} ${styles.pillWarn}`
    : config?.hasKey
      ? `${styles.statusPill} ${styles.pillOk}`
      : `${styles.statusPill} ${styles.pillWarn}`;

  return (
    <div className={styles.page} data-settings-section="model">
      <header className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>模型服务</h2>
          <p className={styles.pageDesc}>连接你信任的模型服务，只有明确选择的内容会发送出去。</p>
        </div>
        <span className={badgeClass}>
          <i className={styles.pillDot} aria-hidden="true" />
          {badge}
        </span>
      </header>

      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="globe" size={16} />
          当前服务
        </div>

        <div className={styles.providerCard}>
          <span className={`${styles.providerDot} ${dotClass}`} aria-hidden="true" />
          <div className={styles.providerIdentity}>
            <div className={styles.providerName}>
              {provider.name}
              <span className={styles.providerTag}>{tag}</span>
            </div>
            <div className={styles.providerMeta}>
              {host || "未设置地址"} · {config?.model ?? modelDraft} · {config?.models?.length ?? 0}{" "}
              个可用模型
            </div>
          </div>
          <button
            className={styles.button}
            onClick={() => (editorOpen ? closeEditor() : setEditorOpen(true))}
          >
            {editorOpen ? "收起" : configured ? "编辑" : "配置"}
          </button>
        </div>

        {editorOpen ? (
          <div className={styles.providerEditor}>
            <div className={styles.providerEditorHead}>
              <div>
                <div className={styles.providerEditorTitle}>编辑模型服务</div>
                <div className={styles.providerEditorDesc}>
                  密钥只保存在本机；保存后会替换当前服务配置。
                </div>
              </div>
              <button className={styles.linkButton} onClick={closeEditor}>
                收起
              </button>
            </div>

            <div className={styles.presetRow}>
              <span>快速预设</span>
              {(
                [
                  ["deepseek", "DeepSeek"],
                  ["openai", "OpenAI 兼容"],
                  ["ollama", "本地 Ollama"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`${styles.preset} ${provider.kind === key ? styles.presetActive : ""}`}
                  onClick={() => applyPreset(key)}
                >
                  {label}
                </button>
              ))}
              <span className={styles.presetHint}>选择预设只填充表单，保存后生效</span>
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>API Key</span>
              <div className={styles.secretField}>
                <input
                  className={styles.input}
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    if (event.target.value) setClearKey(false);
                  }}
                  placeholder={
                    clearKey
                      ? "保存后清除已保存的密钥"
                      : config?.hasKey
                        ? `已配置${config.keyHint ? ` · 尾号 ${config.keyHint}` : ""}，留空保持不变`
                        : local
                          ? "本地服务通常不需要密钥"
                          : "sk-…"
                  }
                  autoComplete="new-password"
                  spellCheck={false}
                />
                {apiKey ? (
                  <button
                    type="button"
                    className={styles.secretToggle}
                    onClick={() => setShowKey((visible) => !visible)}
                    aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                  >
                    {showKey ? "隐藏" : "显示"}
                  </button>
                ) : null}
              </div>
              <span className={styles.fieldHint}>
                {config?.hasKey
                  ? "已保存的密钥不会读回输入框；输入新密钥会替换它。"
                  : "密钥只写入本机代理，不会进入页面 bundle。"}
              </span>
            </label>

            {config?.hasKey ? (
              <div className={`${styles.field} ${styles.keyActions}`}>
                {clearKey ? (
                  <>
                    <span className={styles.fieldHint}>保存后将清除已保存的密钥。</span>
                    <button className={styles.linkButton} onClick={() => setClearKey(false)}>
                      撤销
                    </button>
                  </>
                ) : (
                  <button className={styles.linkButton} onClick={() => setClearKey(true)}>
                    清除已保存的密钥
                  </button>
                )}
              </div>
            ) : null}

            <details className={styles.advanced}>
              <summary>自定义设置</summary>
              <div className={styles.formGrid}>
                <label className={`${styles.field} ${styles.fieldWide}`}>
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
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>允许切换的模型</span>
                  <input
                    className={styles.input}
                    value={allowDraft}
                    onChange={(event) => setAllowDraft(event.target.value)}
                    placeholder="deepseek-flash, deepseek-v4-pro"
                    spellCheck={false}
                  />
                </label>
              </div>
              <div className={styles.fieldHint}>
                自部署或中转服务使用 OpenAI Chat Completions 兼容地址；模型名用逗号分隔。
              </div>
            </details>

            <div className={styles.actions}>
              <button
                className={`${styles.button} ${styles.primary}`}
                onClick={() => void saveProvider(true)}
                disabled={busy !== null}
              >
                {busy === "test" ? "正在连接…" : "保存并测试"}
              </button>
              <button
                className={styles.button}
                onClick={() => void saveProvider(false)}
                disabled={busy !== null}
              >
                {busy === "save" ? "保存中…" : "仅保存"}
              </button>
              <button className={styles.linkButton} onClick={closeEditor} disabled={busy !== null}>
                取消
              </button>
            </div>
          </div>
        ) : null}

        {result ? (
          <div
            className={`${styles.inlineNotice} ${resultError ? styles.noticeError : styles.noticeOk}`}
            aria-live="polite"
          >
            <Icon name={resultError ? "error" : "check"} size={15} />
            {result}
          </div>
        ) : null}
        {configError ? (
          <div className={`${styles.inlineNotice} ${styles.noticeError}`}>
            <Icon name="error" size={15} />
            {configError}
          </div>
        ) : null}
      </div>

      <details className={`${styles.group} ${styles.groupDetails}`}>
        <summary className={styles.groupSummary}>
          <span>高级设置</span>
          <span className={styles.groupHint}>费用单价与预算估算</span>
        </summary>
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
          <button
            className={styles.button}
            onClick={() => void testConnection()}
            disabled={busy !== null}
          >
            {busy === "test" ? "正在连接…" : "测试已保存的连接"}
          </button>
          <span className={styles.fieldHint}>只影响本地费用估算，实际费用以服务商返回为准。</span>
        </div>
      </details>
    </div>
  );
}
