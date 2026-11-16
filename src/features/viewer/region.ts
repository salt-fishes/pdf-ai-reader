export const REGION_EVENT = "pdf:region-selected";

export type RegionRect = { x: number; y: number; w: number; h: number };

export type RegionSelectionDetail = {
  page: number;
  rect: RegionRect;
};

export function emitRegionSelection(detail: RegionSelectionDetail): void {
  window.dispatchEvent(new CustomEvent<RegionSelectionDetail>(REGION_EVENT, { detail }));
}
