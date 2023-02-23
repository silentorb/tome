import { DataSource } from '@tome/database/dist/src'

export interface TypeReference {
  name: string
  types: string[]
}

export type ListOrder = 'indexed' | [string, 'asc' | 'desc'][]

export interface Property {
  name: string
  title: string
  type: TypeReference
  order?: ListOrder
}

export type PropertyMap = { [key: string]: Property }

export interface TypeDefinition {
  title: string // Usually singular
  id: string // Usually plural
  properties: PropertyMap
  union: TypeReference[]
}

export type TypeMap = { [key: string]: TypeDefinition }

export interface DataSchema {
  id: string
  title: string
  types: TypeMap
}

export type DataSchemaMap = { [key: string]: DataSchema }

export interface DatabaseSchema {
  schemas: DataSchemaMap
}
