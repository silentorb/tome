import { DataSchema, DataSchemaMap, ExpandedDocument, GraphLibrary, TypeDefinition } from '@tome/data-api'

export interface DataSource {
  id: string
  filePath: string
  typeFilePaths: { [key: string]: string }
}

export type DataSourceMap = { [key: string]: DataSource }

export interface QueryContext {
  config: DatabaseConfig
  getDocument: GetExpandedDocument
  nodePath: NodePath
}

export interface DatabaseConfig {
  schemas: DataSchemaMap
  sources: DataSourceMap
  library: GraphLibrary
}

export interface NodePath {
  path: string
  schema?: DataSchema
  filePath: string
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

export type GetExpandedDocument = (id: string) => Promise<ExpandedDocument | undefined>
