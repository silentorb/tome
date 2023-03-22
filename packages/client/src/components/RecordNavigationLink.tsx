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
  const icon = item.isDirectory ? <Folder/> : <File/>
  const absolute = getAbsoluteResourceUrl(item.id)
  return (
    <LinkStyle key={item.id} className="tome-record-icon">
      {icon} <Link to={absolute}>{item.title}</Link>
    </LinkStyle>
  )
}
