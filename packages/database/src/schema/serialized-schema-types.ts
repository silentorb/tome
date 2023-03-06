import { ListOrder } from '@tome/data-api'

export interface SerializedTypeReferenceStructure {
  name: string
  types: string[]
}

export type SerializedTypeReference =SerializedTypeReferenceStructure | string

export interface SerializedProperty {
  name: string
  title: string
  type: SerializedTypeReference
  order?: ListOrder
  otherProperty?: string
}

export type SerializedPropertyMap = { [key: string]: SerializedProperty }

export interface SerializedTypeDefinition {
  title: string
  filePath?: string
  properties?: SerializedPropertyMap
  union?: SerializedTypeReference[]
}

export type SerializedTypeMap = { [key: string]: SerializedTypeDefinition }

export interface SerializedDataSchema {
  id?: string
  title: string
  types: SerializedTypeMap
}
