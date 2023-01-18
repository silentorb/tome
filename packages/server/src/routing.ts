import { ServerConfig } from './types'
import { EndpointPaths } from '@tome/web-api'
import { loadNodeFromRequest, queryNodesFromRequest } from './reading'
import { writeNodeFromRequest } from './writing'
import { EndpointDefinition } from '@vineyard/lawn'

export function newEndpoints(config: ServerConfig): EndpointDefinition[] {
  return [
    {
      method: 'post',
      path: EndpointPaths.nodeGet,
      handler: loadNodeFromRequest(config.data),
    },
    {
      method: 'post',
      path: EndpointPaths.nodeSet,
      handler: writeNodeFromRequest(config.data),
    },
    {
      method: 'post',
      path: EndpointPaths.nodeQuery,
      handler: queryNodesFromRequest(config.data),
    },
  ]
}
