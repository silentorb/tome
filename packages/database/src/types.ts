import { DataSchema } from '@tome/data-api'

export interface DatabaseConfig {
  id: string
  filePath: string
  schema: DataSchema
}
