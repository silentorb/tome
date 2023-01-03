export interface Property {
  name: string
  displayName: string
}

export interface Structure {
  name: string // Usually singular
  path: string // Usually plural
  properties: Property[]
}

export interface DataSchema {
  structures: Structure[]
}
