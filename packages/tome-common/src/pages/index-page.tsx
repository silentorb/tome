import * as React from 'react'
import { LinkRecord } from '../types'
import { ParentNavigation } from '../components/misc'

interface Props {
  items: LinkRecord[]
  includeParentNavigation: boolean
}

export const IndexPage = (props: Props) => {
  const links = props.items.map(item => {
    return (
      <li key={item.path}>
        <a href={item.path}>{item.title}</a>
      </li>
    )
  })

  const parentNavigation = props.includeParentNavigation
    ? <ParentNavigation/> : undefined

  return (
    <>
      {parentNavigation}
      <ul>
        {links}
      </ul>
    </>
  )
}
