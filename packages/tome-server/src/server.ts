import * as Koa from 'koa'
import { renderPage } from './rendering'

export function startServer(env: any = process.env) {
  const app = new Koa()
  app.use(async context => {
    context.body = renderPage()
  })

  const port = env.PORT || 3000

  console.log(`Starting server on port ${port}`)

  app.listen(port)
}
