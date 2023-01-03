import { DocumentList, ExpandedDocument, RecordLink, Structure } from '@tome/data-api'
import { DatabaseConfig } from './types'
import { joinPaths } from './file-operations'
import path from 'path'

// Should be imported from remark-parse but that would require an async import.
// This can be replaced by an import later.
type Root = any

export function getStructureFromId(config: DatabaseConfig, id: string): Structure | undefined {
  const pathTokens = id.split('/')
  if (pathTokens.length < 2)
    throw new Error(`Incomplete id path: ${id}`)

  // TODO: This will also need to route databases based on the first path token once multiple databases are supported
  const pluralName = pathTokens[pathTokens.length - 2]

  const schema = config.schema
  return schema.structures.filter(s => s.path == pluralName)[0]
}

interface HeadingListInfo {
  index: number
  name: string
  heading: any
  list: any
}

function findNodeOfType(node: any, type: string): any | undefined {
  if (!node)
    return undefined

  if (node.type == type)
    return node

  if (!Array.isArray(node.children))
    return undefined

  for (const child of node.children) {
    const result = findNodeOfType(child, type)
    if (result)
      return result
  }

  return undefined
}

function getNodeText(node: any): string | undefined {
  const textNode = findNodeOfType(node, 'text')
  return textNode ? textNode.value : undefined
}

function gatherHeadingLists(data: Root): HeadingListInfo[] {
  let index = -1
  const result: HeadingListInfo[] = []
  const children = data.children
  for (const child of children) {
    ++index
    if (child.type == 'heading' && child.depth == 2) {
      const next = children[index + 1]
      const name = getNodeText(child)
      if (name && next && next.type == 'list') {
        result.push({
          index,
          name,
          heading: child,
          list: next
        })
      }
    }
  }

  return result
}

function gatherListLinks(localId: string, listNode: any): RecordLink[] {
  const result: RecordLink[] = []
  for (const child of listNode.children) {
    const linkNode = findNodeOfType(child, 'link')
    if (linkNode) {
      const title = getNodeText(linkNode)
      if (title) {
        result.push({
          title,
          id: joinPaths(localId, linkNode.url),
        })
      }
    }
  }

  return result
}

function processHeaders(localId: string, data: Root, structure: Structure): DocumentList[] {
  const headingLists = gatherHeadingLists(data)
  const lists: DocumentList[] = []
  for (const headingList of headingLists) {
    const { name } = headingList
    const property = structure.properties.filter(p => p.displayName == name)[0]
    if (property) {
      lists.push({
        name,
        items: gatherListLinks(localId, headingList.list)
      })
    }
  }

  return lists
}

export async function expandDocument(config: DatabaseConfig, id: string, content: string): Promise<ExpandedDocument> {
  const structure = getStructureFromId(config, id)
  if (!structure) {
    return {
      content,
      lists: [],
    }
  }

  const { unified } = await import('unified')
  const remarkParse = await import('remark-parse')
  const data = await unified()
    .use(remarkParse.default)
    .parse(content)

  const lists = processHeaders(path.dirname(id), data, structure)

  return {
    content,
    lists,
  }
}
