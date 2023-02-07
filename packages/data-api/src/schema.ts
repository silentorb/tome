export interface GenericType {
  name: string
  types: string[]
}

export type DataType = string | GenericType

export interface Property {
  name: string
  title: string
  type: DataType
}

export type PropertyMap = { [key: string]: Property }

export interface Structure {
  title: string // Usually singular
  path: string // Usually plural
  properties: PropertyMap
}

export type StructureMap = { [key: string]: Structure }

export interface DataSchema {
  id: string
  title: string
  structures: StructureMap
}
