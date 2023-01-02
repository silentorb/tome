export interface RecordLink {
  title: string
  id: string
  isDirectory?: boolean
}

export interface DocumentList {
  name: string
  items: RecordLink[]
}

export interface ExpandedDocument {
  content: string
  lists: DocumentList[]
}

export interface IndexNode {
  type: 'index',
  id: string
  items: RecordLink[]
}

export interface DocumentNode {
  type: 'document'
  id: string
  document: ExpandedDocument
}

export type Node = DocumentNode | IndexNode
