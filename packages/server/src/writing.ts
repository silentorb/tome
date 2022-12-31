import { ServerConfig } from './types'
import { DefaultContext } from 'koa'
import { PostDocumentRequest } from '@tome/web-api'
import { writeDocument } from '@tome/database'

export type DocumentWriter = (config: ServerConfig) => (context: DefaultContext) => Promise<void>

export const writeDocumentFromRequest: DocumentWriter = config => async context => {
  const body = context.request.body as PostDocumentRequest
  const { id } = body
  const { content } = body.document
  await writeDocument(config.data)({ id, content })
}
