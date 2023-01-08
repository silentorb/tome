import { File, Folder } from 'react-feather'
import { Link } from 'react-router-dom'
import * as React from 'react'
import { RecordLink } from '@tome/data-api'
import styled from 'styled-components'
import { elementSequence } from './styling'

interface Props {
  item: RecordLink
}

const LinkStyle = styled.span`
  ${elementSequence}
`

export const RecordNavigationLink = (props: Props) => {
  const { item } = props
  const icon = item.isDirectory ? <Folder/> : <File/>
  const absolute = new URL(item.id, new URL('data/', document.location.origin)).pathname
  return (
    <LinkStyle key={item.id}>
      {icon} <Link to={absolute}>{item.title}</Link>
    </LinkStyle>
  )
}
