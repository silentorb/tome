import * as React from 'react'
import { Dispatch, SetStateAction } from 'react'
import { Property, TypeReference } from '@tome/data-api'
import styled from 'styled-components'
import { StatePairMap } from '../utility'
import { FieldStates } from './utility'

interface Props {
  fieldStates: FieldStates
}

export const TextInput = styled.input`

`

const onChange = (setValue: Dispatch<SetStateAction<any>>) => (event: any) => {
  setValue(event.target.value)
}

export const FieldSection = (props: Props) => {
  const { fieldStates } = props

  const rows = fieldStates.map(entry => {
    const { property, value, set } = entry
    return <div key={property.id}>
      {property.title}: <TextInput type="number" value={value} onChange={onChange(set)}/>
    </div>
  })

  return <>
    <h2>Metadata</h2>
    {rows}
  </>
}
