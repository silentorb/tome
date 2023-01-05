import { Node, RecordLink, Structure } from '@tome/data-api'

export type GetNodeResponse = {
  node: Node
}

export type GetNodesResponse = {
  nodes: Node[]
}

export type GetNodeLinksResponse = {
  links: RecordLink[]
}
