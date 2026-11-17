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

/**
 * The book-spine mark: coral-free and monochrome so it can sit on any accent
 * surface. The app icon, the PDF file icon and this mark share the same
 * geometry (spine + page + dot).
 */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.2" y="2.4" width="4.4" height="19.2" rx="2.2" fill="currentColor" />
      <rect x="9.4" y="2.4" width="11.4" height="19.2" rx="2.6" fill="currentColor" opacity=".55" />
      <circle cx="17.7" cy="17.6" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** White-background PDF file mark used in the empty reading state. */
export function PdfFileMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" aria-hidden="true">
      <path
        d="M44 12H164L216 64V224Q216 244 196 244H44Q24 244 24 224V32Q24 12 44 12Z"
        fill="#FFFDF7"
        stroke="#D9D0C0"
        strokeWidth="2"
      />
      <path d="M164 12 216 64H184Q164 64 164 44Z" fill="#EFE6D5" />
      <rect x="32" y="26" width="12" height="204" rx="6" fill="#FF7A59" />
      <rect x="62" y="94" width="96" height="11" rx="5.5" fill="#1B1A22" opacity=".22" />
      <rect x="62" y="118" width="74" height="11" rx="5.5" fill="#1B1A22" opacity=".16" />
      <rect x="62" y="142" width="86" height="11" rx="5.5" fill="#1B1A22" opacity=".12" />
      <rect x="58" y="188" width="80" height="32" rx="9" fill="#FF7A59" />
      <text
        x="98"
        y="210"
        textAnchor="middle"
        fontFamily="Segoe UI, Arial, sans-serif"
        fontSize="18"
        fontWeight="700"
        fill="#14131A"
      >
        PDF
      </text>
    </svg>
  );
}
