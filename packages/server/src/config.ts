import { ServerConfig } from './types'
import * as path from 'path'
import { DatabaseConfig, loadDatabase } from '@tome/database'

export async function initializeDataConfig(env: any = process.env): Promise<DatabaseConfig> {
  const filePath = path.resolve(env.DATA_PATH)
  return loadDatabase(filePath)
}

export async function initializeConfig(env: any = process.env): Promise<ServerConfig> {
  return {
    urlBase: 'data',
    port: env.PORT || 3000,
    data: await initializeDataConfig(env),
  }
}
