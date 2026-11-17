import { useEffect, useState } from "react";
import { Icon } from "../../../components/icons/Icon";
import { fetchModels, saveProviderConfig } from "../../../lib/ai/client";
import { DEFAULT_PRICING } from "../../../lib/tokens/meter";
import { useAssistant } from "../../assistant/useAssistantStore";
import styles from "../../../components/Modal.module.css";

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

export function ModelSection() {
  const config = useAssistant((state) => state.config);
  const configError = useAssistant((state) => state.configError);
  const refreshConfig = useAssistant((state) => state.refreshConfig);
  const pricing = useAssistant((state) => state.pricing);
  const setPricing = useAssistant((state) => state.setPricing);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [allowDraft, setAllowDraft] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [pricingDraft, setPricingDraft] = useState(DEFAULT_PRICING);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [result, setResult] = useState("");
  const [resultError, setResultError] = useState(false);

  useEffect(() => {
    if (!config) return;
    setBaseUrl(config.baseUrl ?? "");
    setModelDraft(config.model);
    setAllowDraft((config.modelAllow ?? []).join(", "));
  }, [config]);

  useEffect(() => {
    setPricingDraft(pricing);
  }, [pricing]);

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
      await refreshConfig();
      setApiKey("");
      setClearKey(false);
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
          连接设置
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
                  : "sk-…"
              }
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {config?.hasKey ? (
            <div className={`${styles.field} ${styles.fieldWide} ${styles.keyActions}`}>
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
          <label className={`${styles.field} ${styles.fieldWide}`}>
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
        </div>
        {result ? (
          <div
            className={`${styles.inlineNotice} ${resultError ? styles.noticeError : styles.noticeOk}`}
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
