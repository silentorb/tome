import Koa from 'koa'
import { ServerConfig } from './types'
import { initializeConfig } from './config'
import { newRouter } from './routing'
import serveStatic from 'koa-static'
import path from 'path'

export function startServer(config: ServerConfig = initializeConfig()) {
  const { port } = config

  const app = new Koa()
  const router = newRouter(config)
  app.use(router.routes())
  app.use(router.allowedMethods())
  app.use(serveStatic(path.resolve(__dirname, "../../tome-client/dist")))
  console.log(path.resolve(__dirname, "../../tome-client/dist"))
  console.log(`Starting server on port ${port}`)

  app.listen(port)
}
