import { useMemo } from "react";
import type { StoredOcrLine } from "../../lib/storage/db";

type Props = {
  lines: StoredOcrLine[];
  width: number;
  height: number;
  page: number;
};

type MeasureContext = CanvasRenderingContext2D | null;

let measureContext: MeasureContext | undefined;
const measureCache = new Map<string, number>();

function textWidth(text: string, fontSize: number): number {
  if (measureContext === undefined) {
    measureContext =
      typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  if (!measureContext) return 0;
  const key = `${fontSize.toFixed(1)}|${text}`;
  const hit = measureCache.get(key);
  if (hit != null) return hit;
  measureContext.font = `${fontSize}px sans-serif`;
  const width = measureContext.measureText(text).width;
  if (measureCache.size > 6000) measureCache.clear();
  measureCache.set(key, width);
  return width;
}

/**
 * A transparent, line-level text layer over a scanned page.
 *
 * Geometry comes from PP-OCR line boxes normalized to 0–1, so zoom and DPR do
 * not require re-recognition. The inline font size is the line height and the
 * horizontal scale stretches the text to the detected box, keeping the native
 * selection highlight close to the printed line.
 */
export function OcrTextLayer({ lines, width, height, page }: Props) {
  const spans = useMemo(() => {
    if (!width || !height) return [];
    return lines.map((line, index) => {
      const fontSize = Math.max(5, height * line.h * 0.92);
      const measured = textWidth(line.text, fontSize);
      const target = Math.max(1, width * line.w);
      const scale = measured > 0 ? Math.min(6, Math.max(0.1, target / measured)) : 1;
      return { line, index, fontSize, scale };
    });
  }, [lines, width, height]);

  if (!lines.length) return null;

  return (
    <div
      className="ocrTextLayer"
      data-ocr-layer="1"
      data-ocr-page={page}
      role="group"
      aria-label={`第 ${page} 页 OCR 识别文字层，可能有误差`}
    >
      {spans.map(({ line, index, fontSize, scale }) => (
        <span
          key={`${index}_${Math.round(line.x * 10000)}_${Math.round(line.y * 10000)}`}
          className="ocrLine"
          data-ocr-line={index}
          style={{
            left: `${line.x * 100}%`,
            top: `${line.y * 100}%`,
            width: `${line.w * 100}%`,
            height: `${line.h * 100}%`,
            fontSize: `${fontSize}px`,
            transform: `scaleX(${scale})`,
          }}
        >
          {line.text}
        </span>
      ))}
    </div>
  );
}
