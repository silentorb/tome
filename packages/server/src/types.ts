import { DatabaseConfig } from '@tome/database'

export interface ServerConfig {
  data: DatabaseConfig
  port: number

  urlBase: string
}
