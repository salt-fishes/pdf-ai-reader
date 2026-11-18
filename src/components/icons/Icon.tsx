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
  Lock,
  Minus,
  Moon,
  PanelRight,
  Paperclip,
  PictureInPicture2,
  Pin,
  Plus,
  RotateCcw,
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
import { createElement } from "react";

const ICONS = {
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
  lock: Lock,
  pin: Pin,
  plus: Plus,
  stop: Square,
  down: ArrowDown,
  globe: Globe,
  retry: RotateCcw,
  float: PictureInPicture2,
  sidebar: PanelRight,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  title?: string;
};

/** Renders a Lucide icon the same way on every platform. */
export function Icon({ name, size = 16, strokeWidth = 2, className, title }: IconProps) {
  const icon = ICONS[name];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      focusable="false"
    >
      {icon.map(([tag, attrs], index) => createElement(tag, { ...attrs, key: index }))}
    </svg>
  );
}

type StateIconProps = {
  off: IconName;
  on: IconName;
  active: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
  title?: string;
};

/**
 * Two stacked icons with a short crossfade, used for send/stop, copy/check and
 * expand/collapse. The transition lives in globals.css and respects
 * prefers-reduced-motion.
 */
export function StateIcon({
  off,
  on,
  active,
  size = 14,
  strokeWidth = 2,
  className,
  title,
}: StateIconProps) {
  return (
    <span
      className={`iconState${className ? ` ${className}` : ""}`}
      data-state={active ? "on" : "off"}
      style={{ width: size, height: size }}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      <Icon name={off} size={size} strokeWidth={strokeWidth} />
      <Icon name={on} size={size} strokeWidth={strokeWidth} />
    </span>
  );
}
