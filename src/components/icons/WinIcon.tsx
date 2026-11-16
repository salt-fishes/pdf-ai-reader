import {
  ArrowDown,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleHelp,
  Copy,
  Crop,
  Ellipsis,
  FileText,
  Globe,
  Highlighter,
  History,
  Info,
  ListTree,
  Minus,
  Moon,
  Paperclip,
  Pin,
  Search,
  Send,
  Settings,
  Square,
  Sun,
  Trash2,
  X,
  ZoomIn,
  type IconNode,
} from "lucide";
import { MorphIcon } from "morphicons/react";

type WinIconProps = {
  glyph: keyof typeof GLYPHS | string;
  size?: number;
  className?: string;
  title?: string;
};

const GLYPHS = {
  search: "\uE721",
  settings: "\uE713",
  more: "\uE712",
  attach: "\uE723",
  camera: "\uE722",
  crop: "\uE7A8",
  send: "\uE724",
  copy: "\uE8C8",
  highlight: "\uE7E6",
  page: "\uE7C3",
  history: "\uE81C",
  zoom: "\uE71E",
  close: "\uE711",
  clear: "\uE74D",
  minimize: "\uE921",
  chevronLeft: "\uE76B",
  chevronRight: "\uE76C",
  chevronDown: "\uE70D",
  chevronUp: "\uE70E",
  outline: "\uE8FD",
  highlightList: "\uE7E6",
  theme: "\uE706",
  moon: "\uE708",
  help: "\uE897",
  check: "\uE73E",
  error: "\uEA39",
  info: "\uE946",
  pin: "\uE718",
  stop: "\uE71A",
  down: "\uE74B",
  globe: "\uE774",
} as const;

const LUCIDE: Record<string, IconNode> = {
  search: Search,
  settings: Settings,
  more: Ellipsis,
  attach: Paperclip,
  camera: Camera,
  crop: Crop,
  send: Send,
  copy: Copy,
  highlight: Highlighter,
  page: FileText,
  history: History,
  zoom: ZoomIn,
  close: X,
  clear: Trash2,
  minimize: Minus,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  outline: ListTree,
  highlightList: Highlighter,
  theme: Sun,
  moon: Moon,
  help: CircleHelp,
  check: Check,
  error: CircleAlert,
  info: Info,
  pin: Pin,
  stop: Square,
  down: ArrowDown,
  globe: Globe,
};

const windows =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

export function WinIcon({ glyph, size = 16, className, title }: WinIconProps) {
  const fallback = LUCIDE[glyph];
  if (!windows && fallback) {
    return (
      <MorphIcon
        icon={fallback}
        size={size}
        strokeWidth={1.6}
        reducedMotion="user"
        label={title}
        className={className}
      />
    );
  }

  const char = (GLYPHS as Record<string, string>)[glyph] ?? glyph;
  return (
    <span
      className={`win ${className ?? ""}`}
      style={{ fontSize: size }}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      title={title}
    >
      {char}
    </span>
  );
}
