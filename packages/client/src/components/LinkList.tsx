import React, { useState } from 'react'
import { DocumentList, RecordLink } from '@tome/data-api'
import { RecordNavigationLink } from './RecordNavigationLink'
import { Trash2 } from 'react-feather'
import styled from 'styled-components'
import { elementSequence, IconButton } from './styling'

interface Props {
  items: RecordLink[]
  setItems: (items: RecordLink[]) => void
}

interface LinkProps {
  item: RecordLink
  onDelete: (link: RecordLink) => void
}

const LinkItemStyle = styled.li`
  ${elementSequence}
`

const LinkItem = ({ item, onDelete }: LinkProps) => {
  return (
    <LinkItemStyle>
      <RecordNavigationLink item={item}/>
      <IconButton onClick={() => onDelete(item)}><Trash2/></IconButton>
    </LinkItemStyle>
  )
}

const linkToOption = (link: RecordLink) => (
  {
    value: link.id,
    label: link.title
  }
)

const setListItems = (list: DocumentList, items: RecordLink[]) => ({
  ...list,
  items,
})

export const LinkList = (props: Props) => {
  const { items, setItems } = props
  const [options, setOptions] = useState<any[] | undefined>(undefined)

  const onDelete = (link: RecordLink) => {
    setItems(
        items.filter(item => item.id != link.id)
    )
    setOptions(
      options?.concat(linkToOption(link))
    )
  }

  const rows = items.map(item => <LinkItem onDelete={onDelete} item={item} key={item.id}/>)

  return (
    <ul>
      {rows}
    </ul>
  )
}
