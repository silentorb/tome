import { DataSchema } from '@tome/data-api'
import { joinPaths, readFile, readFileOrError } from './file-operations'
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

export async function loadSchema(path: string): Promise<DataSchema> {
  const content = await readFileOrError(joinPaths(path, 'schema.json'))
  const schema = JSON.parse(content) as DataSchema
  expandSerializedSchema(schema)
  return schema
}

export async function loadDatabase(filePath: string): Promise<DatabaseConfig> {
  const schema = await loadSchema(filePath)
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
