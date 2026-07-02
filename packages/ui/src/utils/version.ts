export const APP_VERSION = "0.1.0";

export function versionLabel(suffix = "open source"): string {
  return `Baret · v${APP_VERSION} · ${suffix}`;
}
