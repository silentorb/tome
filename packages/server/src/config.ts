import { ServerConfig } from './types'
import * as path from 'path'
import { DatabaseConfig, loadSchema } from '@tome/database'

export async function initializeDataConfig(env: any = process.env): Promise<DatabaseConfig> {
  const directoryPath = path.resolve(env.DATA_PATH)
  const schema = await loadSchema(directoryPath)
  return {
    path: directoryPath,
    schema,
  }
}

export async function initializeConfig(env: any = process.env): Promise<ServerConfig> {
  return {
    urlBase: 'data',
    port: env.PORT || 3000,
    data: await initializeDataConfig(env),
  }
}
