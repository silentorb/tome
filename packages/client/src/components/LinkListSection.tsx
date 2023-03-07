import { DocumentList, RecordLink } from '@tome/data-api'
import Select from 'react-select'
import React, { useState } from 'react'
import { loadNodesOfType } from '../services'
import { sortLinks } from '@tome/data-processing'
import { getAbsoluteResourceUrl } from '../routing'
import { LinkList } from './LinkList'

interface Props {
  list: DocumentList
  setList: (list: DocumentList) => void
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

export const LinkListSection = (props: Props) => {
  const { list, setList } = props
  const [options, setOptions] = useState<any[] | undefined>(undefined)

  const { items } = list

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
        : sortLinks(list.order, items.concat(newEntries))

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
      <LinkList items={items} setItems={i => {
        setList(setListItems(list, i))
      }}/>
    </div>
  )
}
