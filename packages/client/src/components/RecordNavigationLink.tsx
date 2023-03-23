import { File, Folder } from 'react-feather'
import { Link } from 'react-router-dom'
import * as React from 'react'
import { RecordLink } from '@tome/data-api'
import styled from 'styled-components'
import { elementSequence } from './styling'
import { getAbsoluteResourceUrl } from '../routing'

interface Props {
  item: RecordLink
}

const LinkStyle = styled.span`
  ${elementSequence}
`

export const RecordNavigationLink = (props: Props) => {
  const { item } = props
  const absolute = getAbsoluteResourceUrl(item.id)
  return (
    <Link to={absolute}>{item.title}</Link>
  )
}

export const RecordLinkIcon = (props: Props) => {
  const { item } = props
  return item.isDirectory ? <Folder/> : <File/>
}

export const RecordNavigationLinkWithIcon = (props: Props) => {
  const { item } = props
  return (
    <LinkStyle key={item.id} className="tome-record-icon">
      <RecordLinkIcon item={item}/> <RecordNavigationLink item={item}/>
    </LinkStyle>
  )
}
