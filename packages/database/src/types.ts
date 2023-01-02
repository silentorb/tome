import { DataSchema } from '@tome/data-api'

export interface DatabaseConfig {
  path: string
  schema: DataSchema
}
