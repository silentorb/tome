import {
  SerializedDataSchema,
  SerializedProperty,
  SerializedTypeDefinition,
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

export function expandSerializedProperty(name: string, property: SerializedProperty): Property {
  const { title, order } = property
  const type = expandSerializedTypeReference(name)(property.type)
  return {
    name,
    title,
    type,
    order,
  }
}

export function expandSerializedTypeDefinition(path: string, type: SerializedTypeDefinition): TypeDefinition {
  const { title } = type
  const properties: PropertyMap = Object.fromEntries(
    Object.entries(type.properties || {})
      .map(([id, type]) =>
        [id, expandSerializedProperty(id, type)]
      )
  )

  const unionTypes = (type.union || [])
    .map(expandSerializedTypeReference())

  return {
    path,
    title,
    properties,
    union: unionTypes,
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
        [id, expandSerializedTypeDefinition(id, type)]
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
