import * as React from 'react'
import { ParentNavigation } from './misc'
import { Link } from 'react-router-dom'
import { File, Folder } from 'react-feather'
import { RecordLink } from '@tome/data-api'

interface Props {
  items: RecordLink[]
  includeParentNavigation: boolean
}

export const IndexPage = (props: Props) => {
  const links = props.items.map(item => {
    const url = item.isDirectory ? item.path + '/' : item.path
    const icon = item.isDirectory ? <Folder/> : <File/>
    const absolute = new URL(url, document.location.href).pathname
    return (
      <div key={item.path}>
        {icon} <Link to={absolute}>{item.title}</Link>
      </div>
    )
  })

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
