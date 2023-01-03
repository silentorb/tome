import { DataQuery, ExpandedDocument } from '@tome/data-api'

export const Endpoints = {
  nodeGet: '/node/get',
  nodeSet: '/node/set',
  nodeQuery: '/node/query',
}

export interface GetNodeRequest {
  id: string
}

export interface PostDocumentRequest {
  id: string
  document: ExpandedDocument
}

export type QueryNodesRequest = DataQuery
