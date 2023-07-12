import { LinkListSection } from './LinkListSection'
import * as React from 'react'
import { DocumentList, TypeDefinition } from '@tome/data-api'
import { FieldSection } from './FieldSection'
import { StatePairs } from '../utility'
import { FieldStates } from './utility'

interface Props {
  type?: TypeDefinition
  listStates: StatePairs<DocumentList>
  fieldStates: FieldStates
}

export const PropertiesSection = (props: Props) => {
  const { fieldStates, listStates, type } = props
  const items = listStates.map(([list, setList]) =>
    (<LinkListSection key={list.title} list={list} setList={setList}/>)
  )

  const fields = fieldStates.length > 0
    ? <FieldSection fieldStates={fieldStates}/>
    : undefined

  return <>
    {items}
    {fields}
  </>
}
