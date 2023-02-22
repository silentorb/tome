import { DataSchema, DataSchemaMap, Structure, TypeDefinition } from '@tome/data-api'

export interface DataSource {
  id: string
  filePath: string
}

export type DataSourceMap = { [key: string]: DataSource }

export interface DatabaseConfig {
  schemas: DataSchemaMap
  sources: DataSourceMap
}

export interface NodePath {
  path: string
  schema?: DataSchema
  schemaFilePath?: string
  type?: TypeDefinition
  nodeName?: string
}

export interface AdvancedNodePath extends NodePath {
  title: string
}

export interface ListDiff<T> {
  additions: T[]
  removals: T[]
}

export interface FileWriteJob {
  filePath: string
  content: string
}
