import { ExpandedDocument } from './responses'

export const Endpoints = {
  nodeGet: '/node/get',
  nodeSet: '/node/set',
}

export interface PostDocumentRequest {
  document: ExpandedDocument
}

