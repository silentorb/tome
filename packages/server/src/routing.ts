import { ServerConfig } from './types'
import { Endpoints } from '@tome/web-api'
import { loadNodeFromRequest } from './reading'
import { writeDocumentFromRequest } from './writing'
import { EndpointDefinition } from '@vineyard/lawn'

export function newEndpoints(config: ServerConfig): EndpointDefinition[] {
  return [
    {
      method: 'post',
      path: Endpoints.nodeGet,
      handler: loadNodeFromRequest(config.data),
    },
    {
      method: 'post',
      path: Endpoints.nodeSet,
      handler: writeDocumentFromRequest(config.data),
    },
  ]
}
