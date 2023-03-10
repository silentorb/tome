import { DataColumn, ListOrder, TypeDefinition } from './schema'

export interface RecordLink {
  title: string
  id: string
  isDirectory?: boolean
}

export interface RecordList {
  items: RecordLink[]
  order?: ListOrder
  columns?: DataColumn[]
}

export interface DocumentList extends RecordList {
  title: string
  id: string
  type?: string
  isSingle?: boolean
}

export interface ExpandedDocument {
  title: string
  content: string
  type?: string
  lists: DocumentList[]
}

export interface IndexNode extends RecordList {
  type: 'index',
  id: string
  dataType?: TypeDefinition
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

type FieldSelection = string

export interface DataQuery {
  filters?: QueryFilter[]
  order?: string[]
  select?: FieldSelection[]
}
