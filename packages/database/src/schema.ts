import { DataSchema, DataType } from '@tome/data-api'
import { joinPaths, readFile, readFileOrError, readFileOrErrorSync } from './file-operations'
import { DatabaseConfig, DataSource } from './types'
import path from 'path'

export const isListType = (type: DataType) =>
  type.name == 'list'

export function expandSerializedSchema(schema: DataSchema) {
  for (const [path, structure] of Object.entries(schema.structures)) {
    structure.path = path
    for (const [name, property] of Object.entries(structure.properties)) {
      property.name = name
    }
  }
}

function parseSchema(content: string): DataSchema {
  const schema = JSON.parse(content) as DataSchema
  expandSerializedSchema(schema)
  return schema
}

export async function loadSchema(path: string): Promise<DataSchema> {
  const content = await readFileOrError(joinPaths(path, 'schema.json'))
  return parseSchema(content)
}

export function loadSchemaSync(path: string): DataSchema {
  const content = readFileOrErrorSync(joinPaths(path, 'schema.json'))
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
