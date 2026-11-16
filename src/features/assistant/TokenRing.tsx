import styles from "./Assistant.module.css";

export function TokenRing({ value, size = 16 }: { value: number; size?: number }) {
  const clamped = Math.max(0, Math.min(1, value || 0));
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const className = `${styles.ring} ${clamped >= 0.9 ? styles.ringDanger : clamped >= 0.7 ? styles.ringWarn : ""}`;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <circle className={styles.ringTrack} cx="8" cy="8" r={radius} fill="none" strokeWidth="2" />
      <circle
        className={styles.ringValue}
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
    </svg>
  );
}
