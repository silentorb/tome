import {
  SerializedDataSchema, SerializedDocumentDefinition, SerializedDocumentMap,
  SerializedProperty,
  SerializedTypeDefinition, SerializedTypeMap,
  SerializedTypeReference
} from './serialized-schema-types'
import { CustomDocument, DataSchema, Property, PropertyMap, TypeDefinition, TypeReference } from '@tome/data-api'
import { DataSource } from '../types'
import path from 'path'
import { sortLinks } from '@tome/data-processing/dist/src'

// These functions convert the more concise schema format into the more verbose and computation-friendly schema format.

export const expandSerializedTypeReference = (subType?: string) => (type: SerializedTypeReference): TypeReference => {
  if (typeof type === 'string')
    return {
      name: type,
      types: (type == 'list' && subType) ? [subType] : [],
    }

  return type
}

export function expandSerializedProperty(types: SerializedTypeMap, name: string, property: SerializedProperty): Property {
  const { order, otherProperty } = property
  const type = expandSerializedTypeReference(name)(property.type)
  const title = property.title || types[type.types[0]]?.title
  return {
    id: name,
    title,
    type,
    order,
    otherProperty,
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

  const unions = Object.entries(types)
    .filter(([tid, t]) => (t.union || []).includes(id))
    .map(([tid, t]) => expandSerializedTypeReference()(tid))

  return {
    id,
    title,
    properties,
    union,
    unions,
  }
}

export function expandSerializedDocumentDefinition(documents: SerializedDocumentMap, id: string, document: SerializedDocumentDefinition): CustomDocument {
  const index = document.index

  return {
    id,
    index,
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

  const schemaDocuments = schema.documents || {}

  const documents = Object.fromEntries(
    Object.entries(schemaDocuments)
      .map(([id, type]) =>
        [id, expandSerializedDocumentDefinition(schemaDocuments, id, type)]
      )
  )

  return {
    id,
    title,
    types,
    documents,
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
