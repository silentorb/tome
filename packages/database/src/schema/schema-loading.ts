import { TypeReference } from '@tome/data-api/dist/src'
import { joinPaths, readFileOrError, readFileOrErrorSync } from '../file-operations'
import { DatabaseConfig } from '../types'
import { SerializedDataSchema } from './serialized-schema-types'
import { expandSerializedDataSources, expandSerializedSchema } from './schema-expansion'

export const isListType = (type: TypeReference) =>
  type.name == 'list'

export async function loadSchema(dirPath: string): Promise<SerializedDataSchema> {
  const content = await readFileOrError(joinPaths(dirPath, 'schema.json'))
  return JSON.parse(content) as SerializedDataSchema
}

export function loadSchemaSync(dirPath: string): SerializedDataSchema {
  const content = readFileOrErrorSync(joinPaths(dirPath, 'schema.json'))
  return JSON.parse(content) as SerializedDataSchema
}

function mapIdObject<T extends { id: string }>(items: T[]) {
  return Object.fromEntries(
    items.map(s => [s.id, s])
  )
}

interface DataInput {
  filePath: string
  schema: SerializedDataSchema
}

function prepareDatabases(inputs: DataInput[]): DatabaseConfig {
  const schemas = inputs.map(input => expandSerializedSchema(input.filePath, input.schema))
  const sources = inputs.map(input => expandSerializedDataSources(input.filePath, input.schema))

  return {
    schemas: mapIdObject(schemas),
    sources: mapIdObject(sources),
  }
}

export async function loadDatabases(filePaths: string[]): Promise<DatabaseConfig> {
  const inputs = await Promise.all(
    filePaths.map(async filePath => ({
        filePath,
        schema: await loadSchema(filePath)
      })
    )
  )
  return prepareDatabases(inputs)
}

export function loadDatabasesSync(filePaths: string[]): DatabaseConfig {
  const inputs = filePaths.map(filePath => ({
      filePath,
      schema: loadSchemaSync(filePath)
    })
  )
  return prepareDatabases(inputs)
}
