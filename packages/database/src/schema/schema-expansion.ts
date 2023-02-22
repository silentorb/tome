import {
  SerializedDataSchema,
  SerializedProperty,
  SerializedTypeDefinition,
  SerializedTypeReference
} from './serialized-schema-types'
import { DataSchema, Property, PropertyMap, TypeDefinition, TypeReference } from '@tome/data-api'

// These functions convert the more concise schema format into the more verbose and computation-friendly schema format.

export const expandSerializedTypeReference = (subType?: string) => (property: SerializedTypeReference): TypeReference => {
  if (typeof property === 'string')
    return {
      name: property,
      types: subType ? [subType] : [],
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

export function expandSerializedSchema(schema: SerializedDataSchema): DataSchema {
  const { id, title } = schema

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
