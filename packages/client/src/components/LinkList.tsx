import React, { useState } from 'react'
import { DocumentList, RecordLink } from '@tome/data-api'
import { RecordNavigationLink } from './RecordNavigationLink'
import Select from 'react-select'
import { loadNodesOfType } from '../services'
import { Trash2 } from 'react-feather'
import styled from 'styled-components'
import { elementSequence, IconButton } from './styling'
import { getAbsoluteResourceUrl } from '../routing'
import { sortLinks } from '@tome/data-processing'

interface Props {
  list: DocumentList
  setList: (list: DocumentList) => void
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
  const { list, setList } = props
  const [options, setOptions] = useState<any[] | undefined>(undefined)

  const { items } = list
  const onDelete = (link: RecordLink) => {
    setList(
      setListItems(list,
        items.filter(item => item.id != link.id)
      )
    )
    setOptions(
      options?.concat(linkToOption(link))
    )
  }

  const rows = items.map(item => <LinkItem onDelete={onDelete} item={item} key={item.id}/>)

  const checkOptionsLoaded = () => {
    if (!options && list.type) {
      // To prevent reloading
      setOptions([])
      loadNodesOfType(list.type)
        .then(response => {
          const { links } = response
          setOptions(
            links.map(linkToOption)
              .filter(link => !items.some(item => item.id == link.value))
          )
        })
    }
  }

  const onChange = (selection: any) => {
    if (selection) {
      const newEntries = [{ title: selection.label, id: selection.value }]
      const newItems = list.isSingle
        ? newEntries
        : sortLinks(list.order, items)

      setList(
        setListItems(list, newItems)
      )
      setOptions(
        options?.filter(option => option.value !== selection.value)
      )
    }
  }

  const heading = list.type
    ? <h2><a href={getAbsoluteResourceUrl(list.type)}>{list.title}</a></h2>
    : <h2>{list.title}</h2>

  return (
    <div>
      {heading}
      <Select
        options={options || []}
        onFocus={checkOptionsLoaded}
        onChange={onChange}
        value={[]}
      />
      <ul>
        {rows}
      </ul>
    </div>
  )
}
