import { LinkRecord } from './types'

export interface ExpandedDocument {
  id: string
  content: string
}

export interface GetIndexResponse {
  type: 'index',
  id: string
  items: LinkRecord[]
}

export interface GetDocumentResponse {
  type: 'document'
  document: ExpandedDocument
}

export type GetNodeResponse = GetDocumentResponse | GetIndexResponse
