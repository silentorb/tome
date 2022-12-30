import { ServerConfig } from '../types'
import { isExistingDirectory, joinPaths } from '../file-operations'
import { NodeContainer } from 'tome-common'
import { DefaultContext } from 'koa'
import { getIndex } from './get-index'
import { getDocument } from './get-document'

export function withJsonResponse<T>(loader: (context: DefaultContext) => Promise<T>) {
  return async (context: DefaultContext) => {
    context.body = await loader(context)
  }
}

export type NodeLoader = (config: ServerConfig) => (context: DefaultContext) => Promise<NodeContainer>

export const loadNode: NodeLoader = config => async context => {
  const id = context.request.body.id

  if (id.indexOf('.') !== -1)
    throw new Error(`Invalid id: ${id}`)

  const baseFilePath = joinPaths(config.data.path, id)
  const isDirectory = await isExistingDirectory(baseFilePath)
  if (isDirectory) {
   return getIndex(baseFilePath)
  } else {
   return getDocument(`${baseFilePath}.md`)
  }
}
