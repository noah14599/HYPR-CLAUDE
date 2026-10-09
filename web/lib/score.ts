/** HYPR score colour scale from the design, low → high. */
const SCALE = ["#ff1818", "#ff5c72", "#fd7241", "#f9ad03", "#d4c543", "#91d18d", "#03d8cf", "#03c7e3"];

export function scoreColor(score: number): string {
  const i = Math.max(0, Math.min(SCALE.length - 1, Math.floor((score / 100) * SCALE.length)));
  return SCALE[i];
}
