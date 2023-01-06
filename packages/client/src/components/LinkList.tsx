import React, { useState } from 'react'
import { DocumentList } from '@tome/data-api'
import { RecordNavigationLink } from './RecordNavigationLink'
import Select from 'react-select'
import { loadNodesOfType } from '../services'

// import Async from 'react-select/async'

interface Props {
  list: DocumentList
  setList: (list: DocumentList) => void
}

export const LinkList = (props: Props) => {
  const { list, setList } = props
  const [options, setOptions] = useState<any[] | undefined>(undefined)

  const rows = list.items.map(item => {
    return (<li key={item.id}><RecordNavigationLink item={item}/></li>)
  })

  const checkOptionsLoaded = () => {
    if (!options) {
      // To prevent reloading
      setOptions([])
      loadNodesOfType(list.type)
        .then(response => {
          const { links } = response
          setOptions(
            links
              .filter(link => !list.items.some(item => item.id == link.id))
              .map(link => ({ value: link.id, label: link.title }))
          )
        })
    }
  }

  const onChange = (selection: any) => {
    console.log('value', selection)
    if (selection) {
      setList({
        ...list,
        items: list
          .items.concat([{ title: selection.label, id: selection.value }])
          .sort((a,b) => a.title.localeCompare(b.title)),
      })
      setOptions(
        options?.filter(option => option.value !== selection.value)
      )
    }
  }

  return (
    <div>
      <h2>{list.name}</h2>
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
