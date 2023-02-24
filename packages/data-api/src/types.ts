import { ListOrder, TypeDefinition } from './schema'

export interface RecordLink {
  title: string
  id: string
  isDirectory?: boolean
}

export interface DocumentList {
  name: string
  type?: string
  items: RecordLink[]
  order?: ListOrder
  isSingle?: boolean
}

export interface ExpandedDocument {
  title: string
  content: string
  lists: DocumentList[]
}

export interface IndexNode {
  type: 'index',
  id: string
  dataType?: TypeDefinition
  items: RecordLink[]
}

export interface DocumentNode {
  type: 'document'
  id: string
  document: ExpandedDocument
  dataType?: TypeDefinition
}

export type Node = DocumentNode | IndexNode

export interface QueryFilter {
  key: string
  value: any
}

export interface DataQuery {
  filters?: QueryFilter[]
  order?: string[]
}
