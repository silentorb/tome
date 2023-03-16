import { DataQuery, ExpandedDocument, Node } from '@tome/data-api'

export const EndpointPaths = {
  schemaGet: '/schema',
  nodeGet: '/node/get',
  nodeSet: '/node/set',
  nodeQuery: '/node/query',
  nodeReference: '/nodes',
}

export interface GetNodeRequest {
  id: string
}

export type PutNodeRequest = Node & { oldId?: string }

export interface DeleteNodeRequest {
  id: string
}

export type QueryNodesRequest = DataQuery
