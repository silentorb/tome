import { DataSchema } from '@tome/data-api'
import { joinPaths, readFile, readFileOrError, readFileOrErrorSync } from './file-operations'
import { DatabaseConfig } from './types'
import path from 'path'

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

function prepareDatabase(schema: DataSchema, filePath: string) {
  const id = path.basename(filePath)
  return {
    sources: {
      [id]: {
        id,
        filePath,
        schema
      }
    }
  }
}

export async function loadDatabase(filePath: string): Promise<DatabaseConfig> {
  const schema = await loadSchema(filePath)
  return prepareDatabase(schema, filePath)
}
export function loadDatabaseSync(filePath: string): DatabaseConfig {
  const schema = loadSchemaSync(filePath)
  return prepareDatabase(schema, filePath)
}
