import {DataSchema} from '@tome/data-api'
import { joinPaths, readFile } from './file-operations'

export async function loadSchema(path: string): Promise<DataSchema> {
  const content = await readFile(joinPaths(path, 'schema.json'))
  return JSON.parse(content) as DataSchema
}
