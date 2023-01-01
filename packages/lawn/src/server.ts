import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import { LawnServerConfig } from './types'
import { initializeConfig } from './config'
import Router from '@koa/router'

interface NewServerProps {
  config?: LawnServerConfig
  app?: Koa
  router?: Router
}

export function newServer(props: NewServerProps = {}) {
  const config = props.config || initializeConfig()
  const { port } = config
  const app = props.app || new Koa()
  const router = props.router

  app.use(bodyParser())
  if (router) {
    app.use(router.routes())
    app.use(router.allowedMethods())
  }

  app.listen(port)
  console.log(`Started server on port ${port}`)
  return app
}
