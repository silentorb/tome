import {DataSchema} from '@tome/data-api'
import { joinPaths, readFile, readFileOrError } from './file-operations'
import { DatabaseConfig } from './types'
import path from 'path'

export async function loadSchema(path: string): Promise<DataSchema> {
  const content = await readFileOrError(joinPaths(path, 'schema.json'))
  return JSON.parse(content) as DataSchema
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
