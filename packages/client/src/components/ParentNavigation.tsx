import { RecordLink } from '@tome/data-api'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { RecordNavigationLink } from './RecordNavigationLink'

const withTrailingSlash = (url: string) =>
  url[url.length - 1] == '/'
    ? url
    : `${url}/`

function getParentUrl(): string {
  const current = withTrailingSlash(document.location.href)
  return new URL('..', current).pathname
}

interface Props {
  breadcrumbs?: RecordLink[]
}

export const ParentNavigation = (props: Props) => (
  props.breadcrumbs?.length
    ? <span>{props.breadcrumbs.map(b => <span key={b.id}><RecordNavigationLink item={b}/> </span>)}</span>
    : <Link to={getParentUrl()}>&#9194;</Link>
)
