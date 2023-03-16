import { ServerConfig } from './types'
import { EndpointPaths } from '@tome/web-api'
import { fetchNode, fetchSchema, queryNodesFromRequest } from './reading'
import { deleteNodeFromRequest, writeNodeFromRequest } from './writing'
import { EndpointDefinition } from '@vineyard/lawn'

export function newEndpoints(config: ServerConfig): EndpointDefinition[] {
  return [
    {
      method: 'get',
      path: EndpointPaths.schemaGet,
      handler: fetchSchema(config.data),
    },
    {
      method: 'post',
      path: EndpointPaths.nodeGet,
      handler: fetchNode(config.data),
    },
    {
      method: 'put',
      path: EndpointPaths.nodeSet,
      handler: writeNodeFromRequest(config.data),
    },
    {
      method: 'post',
      path: EndpointPaths.nodeQuery,
      handler: queryNodesFromRequest(config.data),
    },
    {
      method: 'delete',
      path: `${EndpointPaths.nodeReference}/:id(.*)`,
      handler: deleteNodeFromRequest(config.data),
    },
  ]
}
