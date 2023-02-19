export interface DataType {
  name: string
  types: string[]
}

export type ListOrder = 'indexed' | [string, 'asc' | 'desc'][]

export interface Property {
  name: string
  title: string
  type: DataType
  order?: ListOrder
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
