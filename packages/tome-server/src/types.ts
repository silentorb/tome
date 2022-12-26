export interface DatabaseConfig {
  path: string
}

export interface ServerConfig {
  data: DatabaseConfig
  port: number
}
