export type Get<T> = () => T

export interface LinkRecord {
  title: string
  path: string
  isDirectory: boolean
}

export interface ExpandedDocument {
  id: string
  content: string
}

export interface IndexContainer {
  type: 'index',
  id: string
  items: LinkRecord[]
}

export interface DocumentContainer {
  type: 'document'
  document: ExpandedDocument
}

export type NodeContainer = DocumentContainer | IndexContainer
