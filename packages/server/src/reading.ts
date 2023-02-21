import {
  GetNodeLinksResponse,
  GetNodeRequest,
  GetNodeResponse,
  GetNodesResponse,
  QueryNodesRequest
} from '@tome/web-api'
import { DatabaseConfig, loadNode, queryNodes } from '@tome/database'
import { DatabaseSchema } from '@tome/data-api/dist/src'

export type NodeLoader = (config: DatabaseConfig) => (request: GetNodeRequest) => Promise<GetNodeResponse>

export type SchemaLoader = (config: DatabaseConfig) => (request: any) => Promise<DatabaseSchema>

export const fetchSchema: SchemaLoader = config => async _ => {
  const schemas = config.schemas
  return { schemas }
}

export const fetchNode: NodeLoader = config => async request => {
  const { id } = request

  if (id.indexOf('.') !== -1 || id[0] === '/' || id[id.length - 1] == '/')
    throw new Error(`Invalid id: ${id}`)

  const node = await loadNode(config)(id)
  return { node }
}

export type QueryNodes = (config: DatabaseConfig) => (request: QueryNodesRequest) => Promise<GetNodeLinksResponse>

export const queryNodesFromRequest: QueryNodes = config => async request => {
  const links = await queryNodes(config)(request)
  return { links }
}
