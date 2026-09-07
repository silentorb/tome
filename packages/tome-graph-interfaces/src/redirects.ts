/** Static-site redirect map: site-relative path → target node id. */
export interface RedirectsFile {
  version: number;
  redirects: Record<string, string>;
}
