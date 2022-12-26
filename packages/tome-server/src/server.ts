import * as Koa from 'koa'
import { renderPage } from './rendering'
import { ServerConfig } from './types'
import { initializeConfig } from './config'

export function startServer(config: ServerConfig = initializeConfig()) {
  const { port } = config

  const app = new Koa()
  app.use(renderPage(config.data))

  console.log(`Starting server on port ${port}`)

  app.listen(port)
}
