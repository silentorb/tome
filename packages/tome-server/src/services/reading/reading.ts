import { ServerConfig } from '../../types'
import { isExistingDirectory } from '../../file-operations'
import { GetNodeResponse } from 'tome-common'
import { DefaultContext } from 'koa'
import { getIndex } from './get-index'
import { getDocument } from './get-document'
import { getDocumentFilePath } from '../../string-formatting'
import { getIdFromRequest } from '../utility'

export function withJsonResponse<T>(loader: (context: DefaultContext) => Promise<T>) {
  return async (context: DefaultContext) => {
    context.body = await loader(context)
  }
}

export type NodeLoader = (config: ServerConfig) => (context: DefaultContext) => Promise<GetNodeResponse>

export const loadNode: NodeLoader = config => async context => {
  const id = getIdFromRequest(context)

  if (id.indexOf('.') !== -1)
    throw new Error(`Invalid id: ${id}`)

  const baseFilePath = getDocumentFilePath(config, id)
  const isDirectory = await isExistingDirectory(baseFilePath)
  if (isDirectory) {
   return getIndex(baseFilePath)
  } else {
   return getDocument(id, `${baseFilePath}.md`)
  }
}
