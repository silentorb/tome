import { DocumentList, FieldMap, RecordLink } from '@tome/data-api'
import { joinPaths } from './file-operations'
import { idFromPath } from './pathing'
import { NodePath } from './types'
import path from 'path'
import { isListType } from './schema'
import { isPrimitiveType, sortLinks } from '@tome/data-processing/dist/src'
import { getReferencedTypeName } from './type-processing'

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

export const isTitleHeadingNode = (node: any): boolean =>
  node.type == 'heading' && node.depth === 1

export function getMarkdownTitle(node: any): string | undefined {
  const child = node.children.filter(isTitleHeadingNode)[0]
  return child ? getNodeText(child) : undefined
}

export function gatherHeadingLists(data: Root): HeadingListInfo[] {
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
          list: next && next.type == 'list' ? next : undefined
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

export function processLinkHeadings(nodePath: NodePath, data: Root, headingLists: HeadingListInfo[]): DocumentList[] {
  const localId = path.dirname(nodePath.path)
  const lists: DocumentList[] = []
  const type = nodePath.type
  if (!type || !('properties' in type))
    return []

  const properties = type.properties
  const removedContent: number[][] = []

  for (const propertyId in properties) {
    const property = properties[propertyId]
    const type = property.type
    if (!type)
      continue

    if (isPrimitiveType(type))
      continue

    const subType = getReferencedTypeName(property.type)
    if (!subType)
      continue

    const listLists = headingLists.filter(h => h.name == property.title)
    const allItems = listLists.reduce((a, b) => a.concat(b.list ? gatherListLinks(localId, b.list) : []), [] as RecordLink[])
    const items = isListType(type) ? sortLinks(property.order, allItems) : allItems.slice(0, 1)

    lists.push({
      title: property.title,
      id: propertyId,
      type: joinPaths(nodePath.schema!.id, subType),
      items,
      order: property.order || [['title', 'asc']],
    })

    for (const headingList of listLists) {
      removedContent.push([headingList.index, headingList.list ? 2 : 1])
    }
  }

  // Remove sections from last to first to preserve indices.
  // Currently and incidentally this array doesn't need to be sorted, but it's more robust to sort it for now
  // in case the previous step ever becomes more complex and no longer sequential.
  const sortedRemovedContent = removedContent.sort((a, b) => b[0] - a[0])
  for (const [index, count] of sortedRemovedContent) {
    data.children.splice(index, count)
  }

  return lists
}

const keyPairPattern = /(\w+)\s*:\s*(.*)\s*/

export function processMetadataHeading(nodePath: NodePath, data: Root, headingLists: HeadingListInfo[]): FieldMap {
  const headingList = headingLists.find(h => h.name == 'Metadata')
  const list = headingList?.list
  if (!list)
    return {}

  const type = nodePath.type
  if (!type || !('properties' in type))
    return []

  const properties = type.properties

  let fields: FieldMap = {}

  for (const entry of list.children) {
    const text = getNodeText(entry)
    if (text) {
      const match = text.match(keyPairPattern)
      if (match) {
        const [_, key, rawValue] = match
        const property = properties[key]
        fields[key] = property?.type?.name == 'integer'
          ? parseInt(rawValue)
          : rawValue
      }
    }
  }

  data.children.splice(headingList.index, headingList.list ? 2 : 1)

  return fields
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
