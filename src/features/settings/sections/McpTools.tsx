import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../../components/icons/Icon";
import styles from "../../../components/Modal.module.css";
import {
  fetchMcpConfig,
  saveMcpConfig,
  testMcpServer,
  testSciverse,
  type McpPublicConfig,
  type McpServerPublic,
} from "../../../lib/mcp/client";

type ServerDraft = McpServerPublic;

const EMPTY_MESSAGE = "";

export function McpTools() {
  const [config, setConfig] = useState<McpPublicConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [sciverseEnabled, setSciverseEnabled] = useState(false);
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [servers, setServers] = useState<ServerDraft[]>([]);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newHeaders, setNewHeaders] = useState("");
  const [busy, setBusy] = useState<"save" | "sciverse" | "server" | null>(null);
  const [message, setMessage] = useState(EMPTY_MESSAGE);
  const [messageError, setMessageError] = useState(false);
  const [loadError, setLoadError] = useState("");

  const applyConfig = useCallback((next: McpPublicConfig) => {
    setConfig(next);
    setEnabled(next.enabled);
    setSciverseEnabled(next.sciverse.enabled);
    setPrompt(next.sciverse.prompt);
    setServers(next.servers);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchMcpConfig()
      .then((next) => {
        if (alive) applyConfig(next);
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(error instanceof Error ? error.message : "无法读取工具配置");
      });
    return () => {
      alive = false;
    };
  }, [applyConfig]);

  const fail = (error: unknown) => {
    setMessageError(true);
    setMessage(error instanceof Error ? error.message : "操作失败");
  };

  const persist = async (
    nextServers: ServerDraft[],
    extraHeaders: Record<string, Record<string, string>> = {},
    notice = "",
  ): Promise<McpPublicConfig | null> => {
    setBusy("save");
    setMessage("");
    setMessageError(false);
    try {
      const saved = await saveMcpConfig({
        enabled,
        sciverse: {
          enabled: sciverseEnabled,
          token: token.trim() || undefined,
          clearToken,
          prompt,
        },
        servers: nextServers.map((server) => ({
          id: server.id || undefined,
          name: server.name,
          url: server.url,
          enabled: server.enabled,
          ...(extraHeaders[server.id] ? { headers: extraHeaders[server.id] } : {}),
        })),
      });
      applyConfig(saved);
      setToken("");
      setClearToken(false);
      if (notice) setMessage(notice);
      return saved;
    } catch (error) {
      fail(error);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    await persist(servers, {}, "已保存外部工具配置。");
  };

  const addServer = async () => {
    const name = newName.trim();
    const url = newUrl.trim();
    if (!name || !url) {
      setMessageError(true);
      setMessage("请填写服务器名称和 URL。");
      return;
    }
    let headers: Record<string, string> = {};
    if (newHeaders.trim()) {
      try {
        const parsed: unknown = JSON.parse(newHeaders);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("请求头必须是 JSON 对象");
        }
        headers = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        );
      } catch (error) {
        setMessageError(true);
        setMessage(error instanceof Error ? error.message : "请求头不是合法 JSON");
        return;
      }
    }
    const draft: ServerDraft = {
      id: "",
      name,
      url,
      enabled: true,
      headerNames: Object.keys(headers),
    };
    const next = [...servers, draft];
    setServers(next);
    const saved = await persist(next, { [draft.id]: headers }, "已添加 MCP 服务器。");
    if (saved) {
      setNewName("");
      setNewUrl("");
      setNewHeaders("");
    }
  };

  const toggleServer = (id: string) => {
    setServers((current) =>
      current.map((server) =>
        server.id === id ? { ...server, enabled: !server.enabled } : server,
      ),
    );
  };

  const removeServer = (id: string) => {
    if (!id) return;
    const next = servers.filter((server) => server.id !== id);
    setServers(next);
    void persist(next, {}, "已移除 MCP 服务器。");
  };

  const testSciverseNow = async () => {
    if (clearToken || (!token.trim() && !config?.sciverse.hasToken)) {
      setMessageError(true);
      setMessage("请先填写 Sciverse token 并保存。");
      return;
    }
    if (!(await persist(servers))) return;
    setBusy("sciverse");
    setMessage("");
    setMessageError(false);
    try {
      const tools = await testSciverse();
      setMessage(tools.join("；") || "连接成功，但没有返回测试结果。");
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const testServerNow = async (id: string) => {
    if (!id) return;
    if (!(await persist(servers))) return;
    setBusy("server");
    setMessage("");
    setMessageError(false);
    try {
      const tools = await testMcpServer(id);
      setMessage(
        tools.length
          ? `连接成功，发现工具：${tools.join("、")}`
          : "连接成功，但服务器没有提供工具。",
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.group}>
      <div className={styles.groupTitle}>
        <Icon name="globe" size={16} />
        外部工具（MCP / Skills）
      </div>

      {!config ? (
        <div className={styles.fieldHint}>{loadError || "正在读取工具配置…"}</div>
      ) : (
        <>
          <div className={styles.row}>
            <span className={styles.label}>允许 AI 调用外部工具</span>
            <button
              className={`${styles.switch} ${enabled ? styles.switchOn : ""}`}
              role="switch"
              aria-checked={enabled}
              aria-label="允许 AI 调用外部工具"
              onClick={() => setEnabled(!enabled)}
            >
              <i />
            </button>
          </div>
          <div className={styles.fieldHint}>
            工具结果按外部不可信数据处理；只有启用的服务器与 Sciverse 会暴露给模型。
          </div>

          <div className={styles.mcpCard} style={{ marginTop: 12 }}>
            <div className={styles.mcpCardHead}>
              <span className={styles.mcpCardName}>学术检索 · Sciverse</span>
              <span className={styles.mcpStatus}>
                {config.sciverse.hasToken
                  ? `已配置${config.sciverse.tokenHint ? ` · 尾号 ${config.sciverse.tokenHint}` : ""}`
                  : "未配置 token"}
              </span>
              <button
                className={`${styles.switch} ${sciverseEnabled ? styles.switchOn : ""}`}
                role="switch"
                aria-checked={sciverseEnabled}
                aria-label="启用 Sciverse 学术检索"
                onClick={() => setSciverseEnabled(!sciverseEnabled)}
              >
                <i />
              </button>
            </div>
            <div className={styles.mcpCardUrl}>
              语义检索、全文读取、引用关系 · 内置 3 个工具，不需要安装 Node
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Sciverse API Token</span>
              <input
                className={styles.input}
                type="password"
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                  if (event.target.value) setClearToken(false);
                }}
                placeholder={
                  config.sciverse.hasToken
                    ? `已配置${config.sciverse.tokenHint ? ` · 尾号 ${config.sciverse.tokenHint}` : ""}，留空保持不变`
                    : "sv-…"
                }
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className={styles.mcpCardActions}>
              <button
                className={styles.button}
                onClick={() => void testSciverseNow()}
                disabled={busy !== null}
              >
                {busy === "sciverse" ? "测试中…" : "测试连接"}
              </button>
              <a
                className={styles.linkButton}
                href="https://sciverse.space/tokens"
                target="_blank"
                rel="noreferrer"
              >
                获取 token
              </a>
              {config.sciverse.hasToken && !clearToken ? (
                <button className={styles.linkButton} onClick={() => setClearToken(true)}>
                  清除 token
                </button>
              ) : null}
              {clearToken ? (
                <button className={styles.linkButton} onClick={() => setClearToken(false)}>
                  撤销清除
                </button>
              ) : null}
            </div>
            <details className={styles.mcpAdd}>
              <summary>检索指令</summary>
              <textarea
                className={styles.mcpPrompt}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                spellCheck={false}
                aria-label="Sciverse 检索指令"
              />
            </details>
          </div>

          <div className={styles.mcpList}>
            {servers.length ? (
              servers.map((server) => (
                <div className={styles.mcpCard} key={server.id || `${server.name}-${server.url}`}>
                  <div className={styles.mcpCardHead}>
                    <span className={styles.mcpCardName}>{server.name}</span>
                    <span className={styles.mcpStatus}>
                      {server.headerNames.length
                        ? `请求头 ${server.headerNames.join("、")}`
                        : "无自定义请求头"}
                    </span>
                    <button
                      className={`${styles.switch} ${server.enabled ? styles.switchOn : ""}`}
                      role="switch"
                      aria-checked={server.enabled}
                      aria-label={`启用 ${server.name}`}
                      onClick={() => toggleServer(server.id)}
                    >
                      <i />
                    </button>
                  </div>
                  <div className={styles.mcpCardUrl}>{server.url}</div>
                  <div className={styles.mcpCardActions}>
                    <button
                      className={styles.button}
                      onClick={() => void testServerNow(server.id)}
                      disabled={busy !== null || !server.id}
                    >
                      {busy === "server" ? "测试中…" : "测试连接"}
                    </button>
                    <button
                      className={styles.button}
                      onClick={() => removeServer(server.id)}
                      disabled={busy !== null}
                    >
                      移除
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.mcpEmpty}>
                还没有添加 MCP 服务器。支持 Streamable HTTP；本地 stdio 命令会在后续版本加入。
              </div>
            )}
          </div>

          <details className={styles.mcpAdd}>
            <summary>添加 MCP 服务器</summary>
            <div className={styles.formGrid} style={{ marginTop: 10 }}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>名称</span>
                <input
                  className={styles.input}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="例如：实验室工具"
                  spellCheck={false}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Streamable HTTP URL</span>
                <input
                  className={styles.input}
                  value={newUrl}
                  onChange={(event) => setNewUrl(event.target.value)}
                  placeholder="https://example.com/mcp"
                  spellCheck={false}
                />
              </label>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>请求头 JSON（可选）</span>
                <input
                  className={styles.input}
                  value={newHeaders}
                  onChange={(event) => setNewHeaders(event.target.value)}
                  placeholder='{"Authorization":"Bearer …"}'
                  spellCheck={false}
                />
              </label>
            </div>
            <div className={styles.actions}>
              <button
                className={styles.button}
                onClick={() => void addServer()}
                disabled={busy !== null}
              >
                {busy === "save" ? "保存中…" : "添加并保存"}
              </button>
            </div>
          </details>

          <div className={styles.actions}>
            <button
              className={`${styles.button} ${styles.primary}`}
              onClick={() => void save()}
              disabled={busy !== null}
            >
              {busy === "save" ? "保存中…" : "保存工具设置"}
            </button>
          </div>
          {message ? (
            <div
              className={`${styles.inlineNotice} ${messageError ? styles.noticeError : styles.noticeOk}`}
              aria-live="polite"
            >
              <Icon name={messageError ? "error" : "check"} size={15} />
              {message}
            </div>
          ) : null}
          {loadError ? (
            <div className={`${styles.inlineNotice} ${styles.noticeError}`}>
              <Icon name="error" size={15} />
              {loadError}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
