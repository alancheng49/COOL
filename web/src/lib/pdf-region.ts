import type { PdfRegion } from './types';

export function validPdfRegion(value: unknown): PdfRegion | undefined {
  if (!value || typeof value !== 'object') return;
  const r = value as PdfRegion;
  if (![r.page, r.x, r.y, r.width, r.height].every(Number.isFinite)) return;
  if (!Number.isInteger(r.page) || r.page < 1 || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0) return;
  if (r.x + r.width > 1.000001 || r.y + r.height > 1.000001) return;
  return { page: r.page, x: r.x, y: r.y, width: r.width, height: r.height };
}

export function fitPdfRegion(region: PdfRegion, pageWidth: number, pageHeight: number, width: number, height: number) {
  // Keep the whole selected area visible, with a small margin on every side.
  return Math.max(0.05, Math.min(3, (width - 48) / (pageWidth * region.width), (height - 48) / (pageHeight * region.height)));
}
