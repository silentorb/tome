import { LinkListSection } from './LinkListSection'
import * as React from 'react'
import { DocumentList, ExpandedDocument, Property, PropertyMap, TypeDefinition } from '@tome/data-api'
import { Dispatch, SetStateAction } from 'react'
import { FieldSection } from './FieldSection'

interface Props {
  document: ExpandedDocument
  type?: TypeDefinition
  listStates: Array<[DocumentList, Dispatch<SetStateAction<DocumentList>>]>
}

function getPrimitiveTypeFields(properties: PropertyMap): Property[] {
  let result: Property[] = []
  for (const key in properties) {
    const property = properties[key]
    if (property.type.name == 'integer') {
      result.push(property)
    }
  }

  return result
}

export const PropertiesSection = (props: Props) => {
  const { document, listStates, type } = props
  const items = listStates.map(([list, setList]) =>
    (<LinkListSection key={list.title} list={list} setList={setList}/>)
  )

  const fieldProperties = type ? getPrimitiveTypeFields(type.properties) : []
  const fields = fieldProperties.length > 0
    ? <FieldSection values={document.fields} properties={fieldProperties}/>
    : undefined

  return <>
    {items}
    {fields}
  </>
}
