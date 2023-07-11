import * as React from 'react'
import { FieldMap, Property } from '@tome/data-api'

interface Props {
  values: FieldMap
  properties: Property[]
}

export const FieldSection = (props: Props) => {
  const { values, properties } = props
  const rows = properties.map(property => (
    <div key={property.id}>{property.title}: {values[property.id]}</div>
  ))

  return <>
    <h2>Metadata</h2>
    {rows}
  </>
}
