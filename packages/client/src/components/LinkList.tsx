import React, { useState } from 'react'
import { DocumentList } from '@tome/data-api'
import { RecordNavigationLink } from './RecordNavigationLink'
import Select from 'react-select'
// import Async from 'react-select/async'

interface Props {
  list: DocumentList
}

export const LinkList = (props: Props) => {
  const { list } = props
  const [newOptions, setNewOptions] = useState<[] | undefined>(undefined)

  const rows = list.items.map(item => {
    return (<li key={item.id}><RecordNavigationLink item={item}/></li>)
  })

  const checkOptionsLoaded = () => {
    if (!newOptions) {
      setNewOptions([])
    }
  }

  // const loadOptions = (inputValue: string, callback: (options: any[]) => void) => {
  //   setTimeout(() => {
  //     callback([{
  //       value: 'hello',
  //       label: 'World',
  //     }]);
  //   }, 1000);
  // }

  return (
    <div>
      <h2>{list.name}</h2>
      <Select
        options={newOptions || []}
        onFocus={checkOptionsLoaded}
        // loadOptions={loadOptions}
      />
      <ul>
        {rows}
      </ul>
    </div>
  )
}
