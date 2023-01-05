import { PostDocumentRequest } from '@tome/web-api'
import { DatabaseConfig, getNodePath, writeDocument } from '@tome/database'
import { BadRequest } from '@vineyard/lawn'

export type DocumentWriter = (config: DatabaseConfig) => (request: PostDocumentRequest) => Promise<void>

export const writeDocumentFromRequest: DocumentWriter = config => async request => {
  const { id } = request
  const nodePath = getNodePath(config, id)
  if (!nodePath.source)
    throw new BadRequest('Invalid data source in resource path')

  const { content } = request.document
  await writeDocument(config)({ nodePath, content })
}
