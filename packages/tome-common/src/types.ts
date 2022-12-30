export type Get<T> = () => T

export interface LinkRecord {
  title: string
  path: string
  isDirectory: boolean
}

export interface ExpandedDocument {
  content: string
}

export interface IndexContainer {
  type: 'index',
  id: string
  items: LinkRecord[]
}

export interface DocumentContainer {
  type: 'document'
  id: string
  document: ExpandedDocument
}

export type NodeContainer = DocumentContainer | IndexContainer
