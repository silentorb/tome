import { DataSchema, TypeReference } from '@tome/data-api/dist/src'
import { joinPaths, readFileOrError, readFileOrErrorSync } from '../file-operations'
import { DatabaseConfig } from '../types'
import path from 'path'
import { SerializedDataSchema } from './serialized-schema-types'
import { expandSerializedSchema } from './schema-expansion'

export const isListType = (type: TypeReference) =>
  type.name == 'list'

function parseSchema(content: string): DataSchema {
  const schema = JSON.parse(content) as SerializedDataSchema
  return expandSerializedSchema(schema)
}

export async function loadSchema(dirPath: string): Promise<DataSchema> {
  const content = await readFileOrError(joinPaths(dirPath, 'schema.json'))
  return parseSchema(content)
}

export function loadSchemaSync(dirPath: string): DataSchema {
  const content = readFileOrErrorSync(joinPaths(dirPath, 'schema.json'))
  return parseSchema(content)
}

function newSchema(filePath: string, schema: DataSchema): DataSchema {
  const id = schema.id || path.basename(filePath)
  return {
    ...schema,
    id,
  }
}

function mapIdObject<T extends { id: string }>(items: T[]) {
  return Object.fromEntries(
    items.map(s => [s.id, s])
  )
}

interface DataInput {
  filePath: string
  schema: DataSchema
}

function prepareDatabases(inputs: DataInput[]): DatabaseConfig {
  const schemas = inputs.map(input => input.schema)
  const sources = inputs.map(input => ({
    id: input.schema.id,
    filePath: input.filePath
  }))

  return {
    schemas: mapIdObject(schemas),
    sources: mapIdObject(sources),
  }
}

export async function loadDatabases(filePaths: string[]): Promise<DatabaseConfig> {
  const inputs = await Promise.all(
    filePaths.map(async filePath => ({
        filePath,
        schema: newSchema(filePath, await loadSchema(filePath))
      })
    )
  )
  return prepareDatabases(inputs)
}

export function loadDatabasesSync(filePaths: string[]): DatabaseConfig {
  const inputs = filePaths.map(filePath => ({
      filePath,
      schema: newSchema(filePath, loadSchemaSync(filePath))
    })
  )
  return prepareDatabases(inputs)
}
