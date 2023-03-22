export function setPageTitle(title: string) {
  document.title = `Tome | ${title}`
}

const withTrailingSlash = (url: string) =>
  url[url.length - 1] == '/'
    ? url
    : `${url}/`

export function getParentUrl(): string {
  const current = withTrailingSlash(document.location.href)
  return new URL('..', current).pathname
}
