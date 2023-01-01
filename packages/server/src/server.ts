import { ServerConfig } from './types'
import { initializeConfig } from './config'
import { newRouter, newServer } from '@vineyard/lawn'
import { newEndpoints } from './routing'

export function startServer(config: ServerConfig = initializeConfig()) {
  const { port } = config
  const endpoints = newEndpoints(config)

  newServer({
    config: {
      port,
    },
    router: newRouter(endpoints),
  })
}
