import deepseek from "../../assets/models/deepseek.svg";
import openai from "../../assets/models/openai.svg";
import claude from "../../assets/models/claude.svg";
import gemini from "../../assets/models/gemini.svg";
import qwen from "../../assets/models/qwen.svg";
import kimi from "../../assets/models/kimi.svg";
import zhipu from "../../assets/models/zhipu.svg";
import ollama from "../../assets/models/ollama.svg";
import { SparkleIcon } from "./SparkleIcon";
import styles from "./ModelIcon.module.css";

const ASSETS: Array<{ match: RegExp; src: string; label: string }> = [
  { match: /deepseek/i, src: deepseek, label: "DeepSeek" },
  { match: /openai|gpt|o[134]/i, src: openai, label: "OpenAI" },
  { match: /claude|anthropic/i, src: claude, label: "Claude" },
  { match: /gemini|google/i, src: gemini, label: "Gemini" },
  { match: /qwen|qwq|tongyi|dashscope/i, src: qwen, label: "Qwen" },
  { match: /kimi|moonshot/i, src: kimi, label: "Kimi" },
  { match: /glm|zhipu|chatglm/i, src: zhipu, label: "GLM" },
  { match: /ollama|llama/i, src: ollama, label: "Ollama" },
];

export function modelLabel(model: string): string {
  const hit = ASSETS.find((item) => item.match.test(model));
  return hit?.label ?? "模型";
}

export function ModelIcon({
  model,
  size = 19,
  colored = false,
}: {
  model: string;
  size?: number;
  colored?: boolean;
}) {
  const hit = ASSETS.find((item) => item.match.test(model));
  if (!hit) return <SparkleIcon size={size} />;
  if (colored) {
    return <img src={hit.src} alt="" width={size} height={size} className={styles.image} />;
  }
  return (
    <span
      aria-hidden="true"
      className={styles.mask}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url("${hit.src}")`,
        maskImage: `url("${hit.src}")`,
      }}
    />
  );
}
