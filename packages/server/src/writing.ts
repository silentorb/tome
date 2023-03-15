import { PutNodeRequest } from '@tome/web-api'
import { DatabaseConfig, writeDocument, writeIndexDocument } from '@tome/database'
import { BadRequest } from '@vineyard/lawn'
import { getNodePathOrBadRequest } from './utility'

export type DocumentWriter = (config: DatabaseConfig) => (request: PutNodeRequest) => Promise<void>

export const writeNodeFromRequest: DocumentWriter = config => async request => {
  const { id, oldId } = request
  const nodePath = getNodePathOrBadRequest(config, id)

  if (!nodePath.schema)
    throw new BadRequest('Invalid data schema in resource path')

  const oldNodePath = oldId ? getNodePathOrBadRequest(config, oldId) : undefined

  switch (request.type) {
    case 'document': {
      const { document } = request
      await writeDocument(config)({ nodePath, document, oldNodePath })
      break
    }

    case 'index': {
      await writeIndexDocument(config)(nodePath, request.items)
      break
    }
  }
}
