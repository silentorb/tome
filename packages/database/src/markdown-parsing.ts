import { DocumentList, RecordLink, Structure } from '@tome/data-api'
import { joinPaths } from './file-operations'
import { idFromPath } from './pathing'
import { NodePath } from './types'
import path from 'path'
import { isListType } from './schema/schema-loading'

// Should be imported from remark-parse but that would require an async import.
// This can be replaced by an import later.
type Root = any

interface HeadingListInfo {
  index: number
  name: string
  heading: any
  list?: any
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

export function getMarkdownTitle(node: any): string | undefined {
  const child = node.children.filter((c: any) => c.type == 'heading' && c.depth === 1)[0]
  return child ? getNodeText(child) : undefined
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
      if (name) {
        result.push({
          index,
          name,
          heading: child,
          list:  next && next.type == 'list' ? next : undefined
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
          id: idFromPath(joinPaths(localId, linkNode.url)),
        })
      }
    }
  }

  return result
}

export function processHeadings(nodePath: NodePath, data: Root): DocumentList[] {
  const headingLists = gatherHeadingLists(data)
  const localId = path.dirname(nodePath.path)
  const lists: DocumentList[] = []
  const type = nodePath.type
  if (!type || !('properties' in type))
    return []

  const properties = type.properties
  const removedContent: number[][] = []

  for (const propertyId in properties) {
    const property = properties[propertyId]
    const subType = property.type?.types?.at(0)!
    if (!isListType(property.type) || !subType)
      continue

    const listLists = headingLists.filter(h => h.name == property.title)
    const items = listLists.reduce((a, b) => a.concat(b.list ? gatherListLinks(localId, b.list) : []), [] as RecordLink[])

    lists.push({
      name: property.title,
      type: joinPaths(nodePath.schema!.id, subType),
      items,
      order: property.order || [['title', 'asc']],
    })

    for (const headingList of listLists){
      removedContent.push([headingList.index, headingList.list ? 2 : 1])
    }
  }

  // Remove sections from last to first to preserve indices.
  // Currently and incidentally this array doesn't need to be sorted, but it's more robust to sort it for now
  // in case the previous step ever becomes more complex and no longer sequential.
  const sortedRemovedContent = removedContent.sort((a,b) => b[0] - a[0])
  for (const [index, count] of sortedRemovedContent) {
    data.children.splice(index, count)
  }

  return lists
}

export function processIndexList(nodePath: NodePath, data: Root): RecordLink[] {
  const localId = path.dirname(nodePath.path)
  const list = findNodeOfType(data, 'list')
  if (!list)
    return []

  return gatherListLinks(localId, list)
}

export async function parseMarkdownAST(content: string) {

  const { unified } = await import('unified')
  const remarkParse = await import('remark-parse')
  return unified()
    .use(remarkParse.default)
    .parse(content)

}
