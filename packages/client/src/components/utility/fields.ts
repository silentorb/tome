import { Property } from '@tome/data-api'
import { Dispatch, SetStateAction } from 'react'

export interface FieldState {
  property: Property
  value: any
  set: Dispatch<SetStateAction<any>>
}

export type FieldStates = FieldState[]

export function newFieldState(property: Property, getSet: [any, Dispatch<SetStateAction<any>>]) {
  return {
    property,
    value: getSet[0],
    set: getSet[1],
  }
}
