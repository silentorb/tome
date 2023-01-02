export interface Property {

}

export type PropertyMap = { [key: string]: Property }

export interface Structure {
  properties: PropertyMap
}

export type StructureMap = { [key: string]: Structure }

export interface DataSchema {
  structures: StructureMap
}
