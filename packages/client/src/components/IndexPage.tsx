import * as React from 'react'
import { ParentNavigation } from './ParentNavigation'
import { RecordLink } from '@tome/data-api'
import { RecordNavigationLink } from './RecordNavigationLink'

interface Props {
  items: RecordLink[]
  includeParentNavigation: boolean
}

export const IndexPage = (props: Props) => {
  const links = props.items.map(item => (
    <RecordNavigationLink key={item.id} item={item}/>
  ))

  const parentNavigation = props.includeParentNavigation
    ? <ParentNavigation/> : undefined

  return (
    <>
      {parentNavigation}
      <div>
        {links}
      </div>
    </>
  )
}
