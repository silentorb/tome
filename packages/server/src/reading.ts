import { GetNodeRequest, GetNodeResponse } from '@tome/web-api'
import { DatabaseConfig, loadNode } from '@tome/database'

export type NodeLoader = (config: DatabaseConfig) => (request: GetNodeRequest) => Promise<GetNodeResponse>

export const loadNodeFromRequest: NodeLoader = config => async request => {
  const { id } = request

  if (id.indexOf('.') !== -1 || id[0] === '/')
    throw new Error(`Invalid id: ${id}`)

  const node = await loadNode(config)(id)
  return { node }
}
