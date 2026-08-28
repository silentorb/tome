import type { Properties } from "tome-db";

export const STATIC_SITE_LAYOUT_PROPERTY = "static_site_layout";

/** Static-site-only layout presets (editor unchanged). */
export type StaticSiteLayout = "default" | "bare";

const STATIC_SITE_LAYOUTS = new Set<StaticSiteLayout>(["default", "bare"]);

export function parseStaticSiteLayout(raw: unknown): StaticSiteLayout | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (!value || value === "default") return "default";
  if (!STATIC_SITE_LAYOUTS.has(value as StaticSiteLayout)) {
    throw new Error(
      `Invalid ${STATIC_SITE_LAYOUT_PROPERTY}: "${raw}". Allowed values: default, bare.`,
    );
  }
  return value as StaticSiteLayout;
}

export function readStaticSiteLayout(
  properties: Properties | null | undefined,
): StaticSiteLayout | undefined {
  if (!properties) return undefined;
  const parsed = parseStaticSiteLayout(properties[STATIC_SITE_LAYOUT_PROPERTY]);
  return parsed === "default" ? undefined : parsed ?? undefined;
}
