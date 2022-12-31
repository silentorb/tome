import { DefaultContext } from 'koa'

export const getIdFromRequest = (context: DefaultContext) =>
  context.request.body.id
