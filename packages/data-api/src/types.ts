export interface ExpandedDocument {
  content: string
}

export interface RecordLink {
  title: string
  path: string
  isDirectory: boolean
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
