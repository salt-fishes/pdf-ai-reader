export function SparkleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 2.6c.36 4.94 2.46 7.04 7.4 7.4-4.94.36-7.04 2.46-7.4 7.4-.36-4.94-2.46-7.04-7.4-7.4 4.94-.36 7.04-2.46 7.4-7.4Z"
        fill="currentColor"
      />
      <path
        d="M18.6 15.4c.16 2.2 1.1 3.14 3.3 3.3-2.2.16-3.14 1.1-3.3 3.3-.16-2.2-1.1-3.14-3.3-3.3 2.2-.16 3.14-1.1 3.3-3.3Z"
        fill="currentColor"
        opacity=".72"
      />
    </svg>
  );
}

export function QuoteIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.2 6.2H6.4A2.2 2.2 0 0 0 4.2 8.4v3.8c0 1.2 1 2.2 2.2 2.2h2.1v1.2c0 1.6-1 2.6-2.7 3.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.8 6.2h-3.8a2.2 2.2 0 0 0-2.2 2.2v3.8c0 1.2 1 2.2 2.2 2.2h2.1v1.2c0 1.6-1 2.6-2.7 3.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.2" y="2.4" width="17.6" height="19.2" rx="4.2" fill="currentColor" opacity=".14" />
      <path
        d="M7.4 7.4h6.1M7.4 11h9.2M7.4 14.6h5.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M16.5 13.2c.2 2.2 1.3 3.3 3.5 3.5-2.2.2-3.3 1.3-3.5 3.5-.2-2.2-1.3-3.3-3.5-3.5 2.2-.2 3.3-1.3 3.5-3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
