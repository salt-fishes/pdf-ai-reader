/**
 * PDF points are 1/72 inch; CSS pixels are 1/96 inch. pdf.js viewer multiplies
 * the user-facing scale by this factor, which is why its "100%" renders a
 * 10pt glyph at 13.3 CSS px. Without it our 100% was 25% smaller and looked
 * softer at the same zoom label.
 */
export const PDF_TO_CSS_UNITS = 96 / 72;
