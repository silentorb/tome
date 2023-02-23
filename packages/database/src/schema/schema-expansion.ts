import {
  SerializedDataSchema,
  SerializedProperty,
  SerializedTypeDefinition, SerializedTypeMap,
  SerializedTypeReference
} from './serialized-schema-types'
import { DataSchema, Property, PropertyMap, TypeDefinition, TypeReference } from '@tome/data-api'
import { DataSource } from '../types'
import path from 'path'

// These functions convert the more concise schema format into the more verbose and computation-friendly schema format.

export const expandSerializedTypeReference = (subType?: string) => (property: SerializedTypeReference): TypeReference => {
  if (typeof property === 'string')
    return {
      name: property,
      types: (property == 'list' && subType) ? [subType] : [],
    }

  return property
}

export function expandSerializedProperty(types: SerializedTypeMap, name: string, property: SerializedProperty): Property {
  const { order } = property
  const type = expandSerializedTypeReference(name)(property.type)
  const title = property.title || types[type.types[0]]?.title
  return {
    name,
    title,
    type,
    order,
  }
}

export function expandSerializedTypeDefinition(types: SerializedTypeMap, id: string, type: SerializedTypeDefinition): TypeDefinition {
  const { title } = type
  const containingUnions = Object.values(types)
    .filter(parentType => parentType.union?.includes(id))

  const properties: PropertyMap = Object.fromEntries(
    Object.entries(type.properties || {})
      .concat(
        containingUnions.flatMap(parentType => Object.entries(parentType.properties || {}))
      )
      .map(([id, type]) =>
        [id, expandSerializedProperty(types, id, type)] as [string, Property]
      )
      .sort((a, b) => a[1].title.localeCompare(b[1].title))
  )

  const union = (type.union || [])
    .map(expandSerializedTypeReference())

  return {
    id,
    title,
    properties,
    union,
  }
}

const getSchemaId = (filePath: string, schema: SerializedDataSchema) =>
  schema.id || path.basename(filePath)

export function expandSerializedSchema(filePath: string, schema: SerializedDataSchema): DataSchema {
  const { title } = schema
  const id = getSchemaId(filePath, schema)

  const types = Object.fromEntries(
    Object.entries(schema.types)
      .map(([id, type]) =>
        [id, expandSerializedTypeDefinition(schema.types, id, type)]
      )
  )

  return {
    id,
    title,
    types
  }
}

export function expandSerializedDataSources(filePath: string, schema: SerializedDataSchema): DataSource {
  const id = getSchemaId(filePath, schema)
  const typeFilePaths = Object.fromEntries(
    Object.entries(schema.types)
      .map(([name, type]) => [name, type.filePath || name])
  )

  return {
    id,
    filePath,
    typeFilePaths,
  }
}
