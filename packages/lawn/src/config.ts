import { LawnServerConfig } from './types'

export function initializeConfig(env: any = process.env): LawnServerConfig {
  return {
    port: env.PORT || 3000,
  }
}
