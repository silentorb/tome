import { ServerConfig } from './types'
import * as path from 'path'
import { DatabaseConfig, loadDatabases } from '@tome/database'

export async function initializeDataConfig(env: any = process.env): Promise<DatabaseConfig> {
  const paths = ((env.DATA_PATHS?.toString() || '') as string)
    .split(/[;,]/g)
    .map(s => path.resolve(s))

  return loadDatabases(paths)
}

export async function initializeConfig(env: any = process.env): Promise<ServerConfig> {
  return {
    urlBase: 'data',
    port: env.PORT || 3000,
    data: await initializeDataConfig(env),
  }
}
