import type { WorkspaceBranding } from "tome-db";

export const DEFAULT_STATIC_SITE_FOOTER_TEMPLATE = "© Copyright :year: :organization:";

function substituteFooterTemplate(
  template: string,
  organization: string,
  year: number,
): string {
  return template
    .replaceAll(":year:", String(year))
    .replaceAll(":organization:", organization);
}

export function resolveStaticSiteFooter(
  branding?: WorkspaceBranding,
  year: number = new Date().getFullYear(),
): string | undefined {
  const customFooter = branding?.staticSiteFooter;
  const organization = branding?.staticSiteFooterOrganization ?? "";

  if (!customFooter && !organization) {
    return undefined;
  }

  const template = customFooter ?? DEFAULT_STATIC_SITE_FOOTER_TEMPLATE;
  return substituteFooterTemplate(template, organization, year);
}
