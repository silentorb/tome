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

function newSource(filePath: string, schema: DataSchema): DataSource {
  const id = schema.id || path.basename(filePath)
  return {
    id,
    filePath,
    schema
  }
}

function prepareDatabases(sources: DataSource[]): DatabaseConfig {
  return {
    sources:  Object.fromEntries(
      sources.map(s => [s.id, s])
    ),
  }
}

export async function loadDatabases(filePaths: string[]): Promise<DatabaseConfig> {
  const sources = await Promise.all(filePaths.map(async filePath => newSource(filePath, await loadSchema(filePath))))
  return prepareDatabases(sources)
}

export function loadDatabasesSync(filePaths: string[]): DatabaseConfig {
  const sources = filePaths.map(filePath => newSource(filePath, loadSchemaSync(filePath)))
  return prepareDatabases(sources)
}
