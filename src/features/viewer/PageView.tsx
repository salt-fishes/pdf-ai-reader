import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  attachTextLayer,
  getActiveDocument,
  getNativePageText,
  getPageLinks,
  getPageSize,
  type PageLink,
} from "../../lib/pdf/pdf";
import { PDF_TO_CSS_UNITS } from "../../lib/pdf/units";
import { getColorMode } from "../../lib/reading/color";
import { useOcr } from "../ocr/useOcrStore";
import { OcrTextLayer } from "./OcrTextLayer";
import { emitRegionSelection } from "./region";
import { renderPixelRatio } from "./renderRatio";
import { usePixelRatio } from "./usePixelRatio";
import { useViewer, type NormalizedRect } from "./useViewerStore";
import styles from "./PageView.module.css";

type Props = {
  pageNumber: number;
  zoom: number;
  visible: boolean;
  sizeHint: { width: number; height: number };
};

const FALLBACK = { width: 612, height: 792 };

function collectSearchRects(
  container: HTMLElement,
  pageRect: DOMRect,
  query: string,
): NormalizedRect[] {
  if (!pageRect.width || !pageRect.height) return [];
  const needle = query.toLocaleLowerCase("zh-CN");
  if (!needle) return [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let text = "";
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const node = current as Text;
    const value = node.nodeValue ?? "";
    if (!value) continue;
    // Ignore page labels/badges; only real text layers participate.
    if (!node.parentElement?.closest(".textLayer, [data-ocr-layer]")) continue;
    nodes.push({ node, start: text.length, end: text.length + value.length });
    text += value;
  }

  const haystack = text.toLocaleLowerCase("zh-CN");
  if (!haystack) return [];

  const seen = new Set<string>();
  const rects: NormalizedRect[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1 && rects.length < 240) {
    const end = index + needle.length;
    const first = nodes.find((item) => index >= item.start && index < item.end);
    const last = nodes.find((item) => end > item.start && end <= item.end);
    if (first && last) {
      const range = document.createRange();
      range.setStart(first.node, index - first.start);
      range.setEnd(last.node, end - last.start);
      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;
        const normalized = {
          x: (rect.left - pageRect.left) / pageRect.width,
          y: (rect.top - pageRect.top) / pageRect.height,
          w: rect.width / pageRect.width,
          h: rect.height / pageRect.height,
        };
        if (normalized.x < -0.05 || normalized.x > 1.05) continue;
        const key = `${Math.round(normalized.x * 1000)}_${Math.round(normalized.y * 1000)}_${Math.round(normalized.w * 1000)}_${Math.round(normalized.h * 1000)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rects.push(normalized);
        if (rects.length >= 240) break;
      }
    }
    index = haystack.indexOf(needle, index + Math.max(1, needle.length));
  }
  return rects;
}

function smartMask(base: HTMLCanvasElement): HTMLCanvasElement {
  const width = 48;
  const height = Math.max(8, Math.round((48 * base.height) / base.width));
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const sampleContext = sample.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!sampleContext) return sample;
  sampleContext.drawImage(base, 0, 0, width, height);
  const image = sampleContext.getImageData(0, 0, width, height);
  const data = image.data;
  const alpha = new Uint8ClampedArray(width * height);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    const luminance =
      (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
    const t = Math.min(1, Math.max(0, (luminance - 0.5) / 0.32));
    alpha[pixel] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  // A median filter removes small white glyphs (which would otherwise punch
  // inverted halos through dark covers) while keeping large paper regions.
  const radius = 2;
  const filtered = new Uint8ClampedArray(width * height);
  const neighbors: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      neighbors.length = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          neighbors.push(alpha[ny * width + nx]);
        }
      }
      neighbors.sort((a, b) => a - b);
      filtered[y * width + x] = neighbors[Math.floor((neighbors.length - 1) / 2)];
    }
  }
  // Expand the paper mask by one cell so the transition sits on the artwork
  // side of an edge, not on a strip of untouched white paper.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let max = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          max = Math.max(max, filtered[ny * width + nx]);
        }
      }
      data[(y * width + x) * 4 + 3] = max;
    }
  }
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
  }
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  mask.getContext("2d")?.putImageData(image, 0, 0);
  return mask;
}

function PageViewBase({ pageNumber, zoom, visible, sizeHint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const renderingRef = useRef(false);
  const [size, setSize] = useState(sizeHint ?? FALLBACK);
  const pixelRatio = usePixelRatio();
  const [dimmed, setDimmed] = useState(false);
  const [renderVersion, setRenderVersion] = useState(0);
  const colorMode = useViewer((state) => state.colorMode);
  const colorIntensity = useViewer((state) => state.colorIntensity);
  const highlights = useViewer(
    useShallow((state) => state.highlights.filter((item) => item.page === pageNumber)),
  );
  const focusedHighlight = useViewer((state) => state.focusedHighlight);
  const regionPage = useViewer((state) => state.regionPage);
  const searchOpen = useViewer((state) => state.searchOpen);
  const searchQuery = useViewer((state) => state.searchQuery);
  const searchFocus = useViewer((state) => state.searchFocus);
  const handledSearchFocus = useRef(0);
  const ocrPage = useOcr((state) => state.pages[pageNumber]);
  const ocrEnabled = useOcr((state) => state.enabled);
  const [nativeChars, setNativeChars] = useState<number | null>(null);
  const active = regionPage === pageNumber;
  const [layerVersion, setLayerVersion] = useState(0);
  const [links, setLinks] = useState<PageLink[]>([]);
  const [searchRects, setSearchRects] = useState<NormalizedRect[]>([]);
  const [drag, setDrag] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [tooSmall, setTooSmall] = useState(false);
  const dragStart = useRef<{ x: number; y: number; box: DOMRect } | null>(null);

  const clamp = (value: number) => Math.min(1, Math.max(0, value));

  const onRegionDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!active || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - box.left) / box.width);
    const y = clamp((event.clientY - box.top) / box.height);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x, y, box };
    setTooSmall(false);
    setDrag({ x0: x, y0: y, x1: x, y1: y });
  };

  const onRegionMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    setDrag({
      x0: start.x,
      y0: start.y,
      x1: clamp((event.clientX - start.box.left) / start.box.width),
      y1: clamp((event.clientY - start.box.top) / start.box.height),
    });
  };

  const onRegionUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const x1 = clamp((event.clientX - start.box.left) / start.box.width);
    const y1 = clamp((event.clientY - start.box.top) / start.box.height);
    const rect = {
      x: Math.min(start.x, x1),
      y: Math.min(start.y, y1),
      w: Math.abs(x1 - start.x),
      h: Math.abs(y1 - start.y),
    };
    setDrag(null);
    if (rect.w < 0.015 || rect.h < 0.015) {
      setTooSmall(true);
      return;
    }
    useViewer.getState().cancelRegion();
    emitRegionSelection({ page: pageNumber, rect });
  };

  const onRegionCancel = () => {
    dragStart.current = null;
    setDrag(null);
  };

  const selection = drag
    ? {
        left: `${Math.min(drag.x0, drag.x1) * 100}%`,
        top: `${Math.min(drag.y0, drag.y1) * 100}%`,
        width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
        height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
        px: Math.round(Math.abs(drag.x1 - drag.x0) * size.width * zoom * PDF_TO_CSS_UNITS),
        py: Math.round(Math.abs(drag.y1 - drag.y0) * size.height * zoom * PDF_TO_CSS_UNITS),
      }
    : null;

  useEffect(() => {
    if (!visible || !searchOpen) {
      setSearchRects([]);
      return;
    }
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchRects([]);
      return;
    }
    const container = textRef.current;
    const pageElement = container?.parentElement;
    if (!container || !pageElement) return;

    const timer = setTimeout(() => {
      const pageRect = pageElement.getBoundingClientRect();
      setSearchRects(collectSearchRects(pageElement, pageRect, query));
    }, 60);
    return () => clearTimeout(timer);
  }, [visible, searchOpen, searchQuery, pageNumber, layerVersion, ocrPage, ocrEnabled]);

  useEffect(() => {
    const focus = searchFocus;
    if (!focus || focus.page !== pageNumber || !visible) return;
    if (handledSearchFocus.current === focus.at) return;
    const rect = searchRects[focus.occurrence] ?? searchRects[0];
    if (!rect) return;
    handledSearchFocus.current = focus.at;
    useViewer.getState().requestLocation({
      page: pageNumber,
      y: rect.y,
      align: "top",
    });
  }, [searchFocus, searchRects, pageNumber, visible]);

  useEffect(() => {
    if (active) return;
    dragStart.current = null;
    setDrag(null);
    setTooSmall(false);
  }, [active]);

  useEffect(() => {
    setSize(sizeHint ?? FALLBACK);
  }, [sizeHint]);

  useEffect(() => {
    if (!visible) return;
    const pdf = getActiveDocument();
    if (!pdf) return;
    let alive = true;
    getPageSize(pdf, pageNumber).then((next) => {
      if (alive) setSize(next);
    });
    void getNativePageText(pdf, pageNumber).then((text) => {
      if (alive) setNativeChars(text.replace(/\s+/g, "").length);
    });
    void useOcr.getState().hydrate(pageNumber);
    return () => {
      alive = false;
    };
  }, [pageNumber, visible]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return;
    const { colorMode: mode, colorIntensity: intensity } = useViewer.getState();
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    let base = baseRef.current;

    if (mode === "original") {
      if (!base || base.width !== canvas.width || base.height !== canvas.height) return;
      context.save();
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.filter = "none";
      context.drawImage(base, 0, 0);
      context.restore();
      baseRef.current = null;
      maskRef.current = null;
      return;
    }

    if (!base || base.width !== canvas.width || base.height !== canvas.height) {
      // A render is in flight; wait for it to finish instead of copying a
      // partially painted canvas.
      if (renderingRef.current) return;
      base = document.createElement("canvas");
      base.width = canvas.width;
      base.height = canvas.height;
      const baseContext = base.getContext("2d", { alpha: false });
      if (!baseContext) return;
      baseContext.drawImage(canvas, 0, 0);
      baseRef.current = base;
      maskRef.current = null;
    }

    const effect = getColorMode(mode).effect;
    const strength = Math.min(1, Math.max(0, intensity / 100));

    context.save();
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.filter = "none";
    context.drawImage(base, 0, 0);

    if (mode === "smart" && strength > 0.001) {
      // Adaptive smart dark: invert only paper-like regions. A very low-res
      // luminance mask keeps dark covers, photos and white-on-dark titles as
      // they are while turning white paper into a soft dark surface.
      const layer = document.createElement("canvas");
      layer.width = canvas.width;
      layer.height = canvas.height;
      const layerContext = layer.getContext("2d");
      if (layerContext) {
        layerContext.filter = effect.filter ?? "none";
        layerContext.drawImage(base, 0, 0);
        layerContext.filter = "none";
        layerContext.globalCompositeOperation = "destination-in";
        layerContext.imageSmoothingEnabled = true;
        layerContext.imageSmoothingQuality = "high";
        const mask = maskRef.current ?? smartMask(base);
        maskRef.current = mask;
        layerContext.drawImage(mask, 0, 0, layer.width, layer.height);
        context.globalAlpha = strength;
        context.drawImage(layer, 0, 0);
        context.globalAlpha = 1;
      }
    } else if (effect.filter && strength > 0.001) {
      context.filter = effect.filter;
      context.globalAlpha = strength;
      context.drawImage(base, 0, 0);
      context.filter = "none";
      context.globalAlpha = 1;
    }

    if (effect.overlay && strength > 0.001) {
      context.globalAlpha = effect.overlay.alpha * strength;
      context.globalCompositeOperation = effect.overlay.blend;
      context.fillStyle = effect.overlay.color;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.restore();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [paint, colorMode, colorIntensity, renderVersion]);

  useEffect(() => {
    if (!visible) {
      const text = textRef.current;
      if (text) text.replaceChildren();
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      baseRef.current = null;
      renderingRef.current = false;
      maskRef.current = null;
      setLinks([]);
      setDimmed(false);
      return;
    }

    const pdf = getActiveDocument();
    if (!pdf) return;

    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let layer: { cancel: () => void } | null = null;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: zoom * PDF_TO_CSS_UNITS });
          const canvas = canvasRef.current;
          const text = textRef.current;
          if (!canvas || !text) return;

          const ratio = renderPixelRatio(pixelRatio, viewport.width, viewport.height);
          const width = Math.max(1, Math.round(viewport.width * ratio));
          const height = Math.max(1, Math.round(viewport.height * ratio));
          canvas.width = width;
          canvas.height = height;

          // Color modes keep the pristine page in an offscreen canvas so the
          // intensity slider can repaint without re-rendering the PDF.
          const paintIntoBase = useViewer.getState().colorMode !== "original";
          let target: HTMLCanvasElement = canvas;
          if (paintIntoBase) {
            let base = baseRef.current;
            if (!base) {
              base = document.createElement("canvas");
              baseRef.current = base;
            }
            base.width = width;
            base.height = height;
            maskRef.current = null;
            target = base;
          } else {
            baseRef.current = null;
            maskRef.current = null;
          }

          const context = target.getContext("2d", { alpha: false });
          if (!context) return;
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.filter = "none";
          context.globalAlpha = 1;
          context.globalCompositeOperation = "source-over";

          renderingRef.current = true;
          const renderTask = page.render({
            canvas: target,
            canvasContext: context,
            viewport,
            transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
            background: "#ffffff",
          });
          task = renderTask;
          await renderTask.promise;
          renderingRef.current = false;
          if (cancelled) return;

          if (target !== canvas) {
            baseRef.current = target as HTMLCanvasElement;
            maskRef.current = null;
            paint();
          } else {
            // The visible canvas was painted without a color mode; drop any
            // stale base, then recolor it if the mode changed mid-render.
            baseRef.current = null;
            if (useViewer.getState().colorMode !== "original") paint();
          }

          layer = await attachTextLayer(page, text, viewport);
          if (cancelled) {
            layer.cancel();
            return;
          }
          setLinks(await getPageLinks(pdf, page, viewport));
          setDimmed(true);
          setLayerVersion((version) => version + 1);
          setRenderVersion((version) => version + 1);
        } catch (error) {
          renderingRef.current = false;
          const name = (error as { name?: string })?.name;
          if (name !== "RenderingCancelledException" && !cancelled) {
            console.error("page render failed", pageNumber, error);
          }
        }
      })();
    }, 90);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      try {
        task?.cancel();
      } catch {
        // already finished
      }
      try {
        layer?.cancel();
      } catch {
        // already finished
      }
    };
  }, [pageNumber, zoom, visible, paint, pixelRatio]);

  const rects = highlights;
  const showOcrLayer =
    visible &&
    ocrEnabled &&
    ocrPage &&
    ocrPage.lines.length > 0 &&
    (nativeChars === null || nativeChars < 20);

  return (
    <div
      className={styles.page}
      data-page={pageNumber}
      style={{
        width: size.width * zoom * PDF_TO_CSS_UNITS,
        height: size.height * zoom * PDF_TO_CSS_UNITS,
      }}
    >
      {!dimmed && visible ? <div className={styles.skeleton} /> : null}
      <canvas ref={canvasRef} />
      <div className={styles.highlights} aria-hidden="true">
        {rects.map((highlight) =>
          highlight.rects.map((rect, index) => (
            <span
              key={`${highlight.id}_${index}`}
              className={`${styles.highlight} ${
                highlight.source ? styles.highlightOcr : ""
              } ${focusedHighlight?.id === highlight.id ? styles.highlightFocus : ""}`}
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
            />
          )),
        )}
      </div>
      {searchRects.length ? (
        <div className={styles.searchHits} aria-hidden="true">
          {searchRects.map((rect, index) => (
            <span
              key={`${index}_${Math.round(rect.x * 1000)}_${Math.round(rect.y * 1000)}`}
              className={`${styles.searchHit} ${
                searchFocus?.page === pageNumber && index === searchFocus.occurrence
                  ? styles.searchHitFocus
                  : ""
              }`}
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
            />
          ))}
        </div>
      ) : null}
      {links.length ? (
        <div className={styles.links}>
          {links.map((link) => {
            const style = {
              left: `${link.rect.x * 100}%`,
              top: `${link.rect.y * 100}%`,
              width: `${link.rect.w * 100}%`,
              height: `${link.rect.h * 100}%`,
            };
            return link.url ? (
              <a
                key={link.id}
                className={styles.link}
                style={style}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                title={link.title}
                aria-label={link.title}
              />
            ) : (
              <button
                key={link.id}
                className={styles.link}
                style={style}
                onClick={() => link.page && useViewer.getState().requestScroll(link.page)}
                title={link.title}
                aria-label={link.title}
              />
            );
          })}
        </div>
      ) : null}
      <div ref={textRef} className="textLayer" />
      {showOcrLayer ? (
        <OcrTextLayer
          lines={ocrPage.lines}
          width={size.width * zoom * PDF_TO_CSS_UNITS}
          height={size.height * zoom * PDF_TO_CSS_UNITS}
          page={pageNumber}
        />
      ) : null}
      {active ? (
        <div
          className={styles.regionLayer}
          data-region="1"
          role="application"
          aria-label="框选截图：在页面上拖拽选择区域，Esc 取消"
          onPointerDown={onRegionDown}
          onPointerMove={onRegionMove}
          onPointerUp={onRegionUp}
          onPointerCancel={onRegionCancel}
          onContextMenu={(event) => event.preventDefault()}
        >
          {!drag ? <div className={styles.regionShade} /> : null}
          <div className={`${styles.regionTip} ${tooSmall ? styles.regionTipError : ""}`}>
            {tooSmall ? "选区太小，再拖一次" : "拖拽选择区域 · Esc 取消"}
          </div>
          {selection ? (
            <div
              className={styles.regionBox}
              style={{
                left: selection.left,
                top: selection.top,
                width: selection.width,
                height: selection.height,
              }}
            >
              <span className={styles.regionSize}>
                {selection.px} × {selection.py}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      <span className={styles.label}>
        {pageNumber}
        {ocrPage ? (
          <span className={styles.ocrBadge} title="本页文字由本机 OCR 识别，可能有误差">
            OCR
          </span>
        ) : null}
      </span>
    </div>
  );
}

export const PageView = memo(PageViewBase);
