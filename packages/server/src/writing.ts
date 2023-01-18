import { PutNodeRequest } from '@tome/web-api'
import { DatabaseConfig, getNodePath, writeDocument } from '@tome/database'
import { BadRequest } from '@vineyard/lawn'

export type DocumentWriter = (config: DatabaseConfig) => (request: PutNodeRequest) => Promise<void>

export const writeNodeFromRequest: DocumentWriter = config => async request => {
  const { id } = request
  const nodePath = getNodePath(config, id)
  if (!nodePath.source)
    throw new BadRequest('Invalid data source in resource path')

  switch (request.type) {
    case 'document': {
      const { document } = request
      await writeDocument(config)({ nodePath, document })
      break
    }
  }
}
