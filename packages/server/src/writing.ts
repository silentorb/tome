import { PutNodeRequest } from '@tome/web-api'
import { DatabaseConfig, getNodePath, writeDocument, writeIndexDocument } from '@tome/database'
import { BadRequest } from '@vineyard/lawn'

export type DocumentWriter = (config: DatabaseConfig) => (request: PutNodeRequest) => Promise<void>

export const writeNodeFromRequest: DocumentWriter = config => async request => {
  const { id } = request
  const nodePath = getNodePath(config, id)
  if (!nodePath)
    throw new BadRequest(`Invalid resource path: ${id}`)

  if (!nodePath.schema)
    throw new BadRequest('Invalid data schema in resource path')

  switch (request.type) {
    case 'document': {
      const { document } = request
      await writeDocument(config)({ nodePath, document })
      break
    }

    case 'index': {
      await writeIndexDocument(config)(nodePath, request.items)
      break
    }
  }
}
