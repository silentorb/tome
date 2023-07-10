import { LinkListSection } from './LinkListSection'
import * as React from 'react'
import { DocumentList, ExpandedDocument } from '@tome/data-api'
import { Dispatch, SetStateAction } from 'react'

interface Props {
  document: ExpandedDocument
  listStates: Array<[DocumentList, Dispatch<SetStateAction<DocumentList>>]>
}

export const PropertiesSection = (props: Props) => {
  const { document, listStates } = props
  const items = listStates.map(([list, setList]) =>
    (<LinkListSection key={list.title} list={list} setList={setList}/>)
  )

  return <>
    {items}
  </>
}
