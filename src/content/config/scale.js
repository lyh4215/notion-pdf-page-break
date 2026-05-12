export const MIN_SCALE_PERCENT = 11;
export const MAX_SCALE_PERCENT = 199;

export function clampScale(scalePercent) {
  const value = Number(scalePercent);

  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.min(MAX_SCALE_PERCENT, Math.max(MIN_SCALE_PERCENT, value));
}
