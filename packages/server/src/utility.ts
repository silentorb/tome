import { DatabaseConfig, getNodePath, NodePath } from '@tome/database'
import { BadRequest } from '@vineyard/lawn'

export function getNodePathOrBadRequest(config: DatabaseConfig, resourcePath: string): NodePath {
  const nodePath = getNodePath(config, resourcePath)
  if (!nodePath)
    throw new BadRequest(`Invalid resource path: ${resourcePath}`)

  return nodePath
}
