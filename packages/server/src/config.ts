import { ServerConfig } from './types'
import * as path from 'path'

export function initializeConfig(env: any = process.env): ServerConfig {
  return {
    urlBase: 'data',
    port: env.PORT || 3000,
    data: {
      path: path.resolve(env.DATA_PATH)
    }
  }
}
