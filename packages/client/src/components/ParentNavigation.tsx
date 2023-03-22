import { RecordLink } from '@tome/data-api'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { RecordNavigationLink } from './RecordNavigationLink'
import { getParentUrl } from '../utility/browser-utility'

interface Props {
  breadcrumbs?: RecordLink[]
}

export const ParentNavigation = (props: Props) => (
  props.breadcrumbs?.length
    ? <span>{props.breadcrumbs.map(b => <span key={b.id}><RecordNavigationLink item={b}/> </span>)}</span>
    : <Link to={getParentUrl()}>&#9194;</Link>
)
