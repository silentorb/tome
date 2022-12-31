import { DefaultContext } from 'koa'
import { ServerConfig } from './types'
import { GetNodeResponse } from '@tome/web-api'
import { getIdFromRequest } from './utility'
import { loadNode } from '@tome/database'

export function withJsonResponse<T>(loader: (context: DefaultContext) => Promise<T>) {
  return async (context: DefaultContext) => {
    try {
      context.body = await loader(context)
    } catch (error: any) {
      console.error('Error:', error.message, error.stack)
    }
  }
}

export type NodeLoader = (config: ServerConfig) => (context: DefaultContext) => Promise<GetNodeResponse>

export const loadNodeFromRequest: NodeLoader = config => async context => {
  const id = getIdFromRequest(context)

  if (id.indexOf('.') !== -1 || id[0] === '/')
    throw new Error(`Invalid id: ${id}`)

  const node = await loadNode(config.data)(id)
  return { node }
}
