import * as React from 'react'
import { Link } from 'react-router-dom'

const withTrailingSlash = (url: string) =>
  url[url.length - 1] == '/'
    ? url
    : `${url}/`

function getParentUrl(): string {
  const current = withTrailingSlash(document.location.href)
  return new URL('..', current).pathname
}

export const ParentNavigation = () => (
  <p>
    <Link to={getParentUrl()}>&#9194;</Link>
  </p>
)
