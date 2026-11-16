/**
 * Canvas backing-store budget. This is the same 2^25-pixel ceiling the desktop
 * pdf.js viewer uses; unlike a hard DPR cap it preserves sharp text on 3× and
 * 4× screens for normal page sizes, and only walks the ratio down for very
 * large pages.
 */
export const MAX_CANVAS_PIXELS = 2 ** 25;
export const MAX_PIXEL_RATIO = 4;

/**
 * Pick the canvas resolution for a page. We render at the real device pixel
 * ratio instead of a hard 2.5× ceiling, then walk it down only when the page
 * would exceed the pixel budget. Sub-1 ratios would only blur text, so 1 is
 * the floor.
 */
export function renderPixelRatio(pixelRatio: number, width: number, height: number): number {
  const dpr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const area = Math.max(1, width * height);
  const budget = Math.sqrt(MAX_CANVAS_PIXELS / area);
  return Math.max(1, Math.min(dpr, MAX_PIXEL_RATIO, budget));
}
