import { ServerConfig } from './types'
import * as path from 'path'
import { DatabaseConfig, loadSchema } from '@tome/database'

export async function initializeDataConfig(env: any = process.env): Promise<DatabaseConfig> {
  const filePath = path.resolve(env.DATA_PATH)
  const schema = await loadSchema(filePath)
  return {
    id: path.basename(filePath),
    filePath,
    schema
  }
}

export async function initializeConfig(env: any = process.env): Promise<ServerConfig> {
  return {
    urlBase: 'data',
    port: env.PORT || 3000,
    data: await initializeDataConfig(env),
  }
}
