import { DataSource } from '@tome/database/dist/src'

export interface TypeReference {
  name: string
  types: string[]
}

export type ListOrder = 'indexed' | [string, 'asc' | 'desc'][]

export interface Property {
  id: string
  title: string
  type: TypeReference
  order?: ListOrder
  otherProperty?: string
}

export type PropertyMap = { [key: string]: Property }

export interface TypeDefinition {
  title: string // Usually singular
  id: string // Usually plural
  properties: PropertyMap
  union: TypeReference[]
  unions: TypeReference[]
}

export type TypeMap = { [key: string]: TypeDefinition }

export interface CustomDocument {
  title: string // Usually singular
  id: string // Usually plural
  query: any
}

export type CustomDocumentMap = { [key: string]: CustomDocument }

export interface DataSchema {
  id: string
  title: string
  types: TypeMap
  documents: CustomDocumentMap
}

export type DataSchemaMap = { [key: string]: DataSchema }

export interface DatabaseSchema {
  schemas: DataSchemaMap
}
