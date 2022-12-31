import { ExpandedDocument } from '@tome/data-api'

export const Endpoints = {
  nodeGet: '/node/get',
  nodeSet: '/node/set',
}

export interface PostDocumentRequest {
  id: string
  document: ExpandedDocument
}

