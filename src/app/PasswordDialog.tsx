import { useEffect, useRef, useState } from "react";
import { WinIcon } from "../components/icons/WinIcon";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useViewer } from "../features/viewer/useViewerStore";
import styles from "../components/Modal.module.css";

export function PasswordDialog() {
  const open = useViewer((state) => state.passwordRequired);
  const error = useViewer((state) => state.passwordError);
  const submitPassword = useViewer((state) => state.submitPassword);
  const cancelPassword = useViewer((state) => state.cancelPassword);
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusTrap(formRef, open, cancelPassword);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.backdrop}>
      <form
        ref={formRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label="输入 PDF 密码"
        onSubmit={(event) => {
          event.preventDefault();
          void submitPassword(password);
        }}
      >
        <div className={styles.head}>
          <span className={styles.title}>该 PDF 需要密码</span>
          <span className={styles.headSpacer} />
          <button
            type="button"
            className={styles.close}
            onClick={cancelPassword}
            aria-label="取消打开"
          >
            <WinIcon glyph="close" size={15} />
          </button>
        </div>
        <div className={styles.body}>
          <section className={styles.section}>
            <div className={styles.note}>
              密码只用于本机解密，不会上传或保存。取消后保留当前打开的文档。
            </div>
            <label className={styles.row} style={{ marginTop: 12 }}>
              <span className={styles.label}>密码</span>
              <input
                ref={inputRef}
                type="password"
                className={styles.input}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
                aria-label="PDF 密码"
              />
            </label>
            {error ? <div className={styles.result}>{error}</div> : null}
            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={cancelPassword}>
                取消
              </button>
              <button type="submit" className={`${styles.button} ${styles.primary}`}>
                打开文档
              </button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
