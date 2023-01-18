import { DocumentList, GenericType, RecordLink, Structure } from '@tome/data-api'
import { joinPaths } from './file-operations'
import { idFromPath } from './pathing'
import { NodePath } from './types'

// Should be imported from remark-parse but that would require an async import.
// This can be replaced by an import later.
type Root = any

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
          id: idFromPath(joinPaths(localId, linkNode.url)),
        })
      }
    }
  }

  return result
}

export function processHeadings(localId: string, nodePath: NodePath, data: Root): DocumentList[] {
  const headingLists = gatherHeadingLists(data)
  const lists: DocumentList[] = []
  for (const headingList of headingLists) {
    const { name } = headingList
    const property = Object.values(nodePath.structure!.properties).filter(p => p.displayName == name)[0]
    if (property) {
      lists.push({
        name,
        type: joinPaths(nodePath.source!.id, (property.type as GenericType).types[0]),
        items: gatherListLinks(localId, headingList.list)
      })

      data.children.splice(headingList.index, 2)
    }
  }

  return lists
}

export async function parseMarkdownAST(content: string) {

  const { unified } = await import('unified')
  const remarkParse = await import('remark-parse')
  return unified()
    .use(remarkParse.default)
    .parse(content)

}
