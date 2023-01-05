
export interface GenericType {
  name: string
  types: string[]
}

export interface Property {
  name: string
  displayName: string

  type: string | GenericType
}

export interface Structure {
  name: string // Usually singular
  path: string // Usually plural
  properties: Property[]
}

export interface DataSchema {
  structures: Structure[]
}
