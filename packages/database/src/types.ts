import { DataSchema } from '@tome/data-api'

export interface DataSource {
  id: string
  filePath: string
  schema: DataSchema
}

export type DataSourceMap = { [key: string]: DataSource }

export interface DatabaseConfig {
  sources: DataSourceMap
}
