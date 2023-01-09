import { DataSchema, Structure } from '@tome/data-api'

export interface DataSource {
  id: string
  filePath: string
  schema: DataSchema
}

export type DataSourceMap = { [key: string]: DataSource }

export interface DatabaseConfig {
  sources: DataSourceMap
}

export interface NodePath {
  path: string
  source?: DataSource
  structure?: Structure
  nodeName?: string
}

export interface AdvancedNodePath extends NodePath {
  title: string
}

export interface ListDiff<T> {
  additions: T[]
  removals: T[]
}
