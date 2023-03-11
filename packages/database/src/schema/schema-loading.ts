import { GraphLibrary, TypeReference } from '@tome/data-api'
import { joinPaths, readFileOrError, readFileOrErrorSync } from '../file-operations'
import { DatabaseConfig } from '../types'
import { SerializedDataSchema } from './serialized-schema-types'
import { expandSerializedDataSources, expandSerializedSchema } from './schema-expansion'
import { newStandardQueryLibrary } from '../scripting/standard-query-library'

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

function prepareDatabases(library: GraphLibrary, inputs: DataInput[]): DatabaseConfig {
  const schemas = inputs.map(input => expandSerializedSchema(library, input.filePath, input.schema))
  const sources = inputs.map(input => expandSerializedDataSources(input.filePath, input.schema))

  return {
    schemas: mapIdObject(schemas),
    sources: mapIdObject(sources),
    library,
  }
}

export const loadDatabases = (library: GraphLibrary = newStandardQueryLibrary()) => async (filePaths: string[]): Promise<DatabaseConfig> => {
  const inputs = await Promise.all(
    filePaths.map(async filePath => ({
        filePath,
        schema: await loadSchema(filePath)
      })
    )
  )
  return prepareDatabases(library, inputs)
}

export const loadDatabasesSync = (library: GraphLibrary = newStandardQueryLibrary()) => (filePaths: string[]): DatabaseConfig => {
  const inputs = filePaths.map(filePath => ({
      filePath,
      schema: loadSchemaSync(filePath)
    })
  )
  return prepareDatabases(library, inputs)
}
