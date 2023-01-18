export interface GenericType {
  name: string
  types: string[]
}

export interface Property {
  name: string
  displayName: string
  type: string | GenericType
}

export type PropertyMap = { [key: string]: Property }

export interface Structure {
  title: string // Usually singular
  path: string // Usually plural
  properties: PropertyMap
}

export type StructureMap = { [key: string]: Structure }

export interface DataSchema {
  structures: StructureMap
}
