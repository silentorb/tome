import { DataQuery, ExpandedDocument, Node } from '@tome/data-api'

export const EndpointPaths = {
  schemaGet: '/schema',
  nodeGet: '/node/get',
  nodeSet: '/node/set',
  nodeQuery: '/node/query',
}

export interface GetNodeRequest {
  id: string
}

export type PutNodeRequest = Node & { oldId?: string }

export type QueryNodesRequest = DataQuery
