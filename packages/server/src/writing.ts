import { PostDocumentRequest } from '@tome/web-api'
import { DatabaseConfig, writeDocument } from '@tome/database'

export type DocumentWriter = (config: DatabaseConfig) => (request: PostDocumentRequest) => Promise<void>

export const writeDocumentFromRequest: DocumentWriter = config => async request => {
  const { id } = request
  const { content } = request.document
  await writeDocument(config)({ id, content })
}
