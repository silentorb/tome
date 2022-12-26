import * as React from 'react'
import { LinkRecord } from '../types'

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
    ? (<p>
      <a href="..">&#9194;</a>
    </p>) : undefined

  return (
    <>
      {parentNavigation}
      <ul>
        {links}
      </ul>
    </>
  )
}
