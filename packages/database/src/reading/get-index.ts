import { isExistingDirectory, listFiles } from '../file-operations'
import { DataColumn, IndexNode, ListOrder, RecordLink, TypeReference } from '@tome/data-api'
import { DatabaseConfig, GetExpandedDocument, NodePath } from '../types'
import { childNodePath, getBreadcrumbs, getIndexDirectoryPath, getNodePath, idFromPath } from '../pathing'
import { loadDocumentContent, loadDocumentTitle } from './get-document'
import { expandIndexList, recordLinkListsHaveSameOrder } from '../documents'
import { writeIndexDocument } from '../writing'
import { sortLinks } from '@tome/data-processing'
import { expandFields } from './record-expansion'

const newChildLink = (config: DatabaseConfig) => async (nodePath: NodePath): Promise<RecordLink> => {
  const title = await loadDocumentTitle(config, nodePath)

  return {
    title,
    id: nodePath.path,
    isDirectory: !!nodePath.filePath && await isExistingDirectory(nodePath.filePath),
  }
}

export function getDataSourceIndex(config: DatabaseConfig): IndexNode {
  const items = Object.entries(config.schemas)
    .map(([key, value]) => ({
      title: value.title || key,
      id: key,
      isDirectory: true,
    }))

  return {
    type: 'index',
    id: '',
    items,
  }
}

async function loadIndexList(config: DatabaseConfig, nodePath: NodePath): Promise<RecordLink[]> {
  const content = await loadDocumentContent(config, nodePath)
  return content ? expandIndexList(config, nodePath, content) : []
}

// Returns a tuple with the new link list and a boolean for whether the list changed
function syncIndexList(indexLinks: RecordLink[], directoryLinks: RecordLink[]): [RecordLink[], boolean] {
  const indexKeys = new Set(indexLinks.map(r => r.id))
  const directoryKeys = new Set(directoryLinks.map(r => r.id))
  if (indexKeys.size === directoryKeys.size && [...indexKeys].every(value => directoryKeys.has(value)))
    return [indexLinks, false]

  // First select the entries that exist in both sources, maintaining the order in the index file
  const intersection = indexLinks.reduce((a, b) =>
      directoryKeys.has(b.id) ? a.concat(b) : a,
    [] as RecordLink[]
  )

  // Next, append the entries missing from the index file
  const additions = directoryLinks.filter(link => !indexKeys.has(link.id))

  // TODO: Add conditional sorting depending on the structure config
  return [intersection.concat(additions), true]
}

export async function getPhysicalNodeLinks(config: DatabaseConfig, nodePath: NodePath, order?: ListOrder): Promise<RecordLink[]> {
  const filePath = getIndexDirectoryPath(nodePath)
  if (!filePath)
    return []

  const allFiles = await listFiles(filePath)
  const files = allFiles.filter(f => !f.includes('.') || f.match(/\.md$/))
  const withoutIndex = files.filter(f => f != 'index.md')
  const hasIndex = withoutIndex.length < files.length

  const directoryLinks = await Promise.all(
    withoutIndex
      .map(idFromPath)
      .map(childNodePath(config, nodePath))
      .map(newChildLink(config))
  )

  if (hasIndex) {
    const indexLinks = await loadIndexList(config, nodePath)
    const [newList, changed] = syncIndexList(indexLinks, directoryLinks)
    const sortedList = sortLinks(order, newList)
    if (changed || !recordLinkListsHaveSameOrder(newList, sortedList)) {
      await writeIndexDocument(config)(nodePath, sortedList)
    }
    return sortedList
  } else {
    return directoryLinks
  }
}

async function getUnionNodeLinks(config: DatabaseConfig, union: TypeReference[], id: string, order?: ListOrder) {
  let result: RecordLink[] = []
  for (const childType of union) {
    const childNodePath = getNodePath(config, `${id}/${childType.name}`)
    if (childNodePath) {
      result = result.concat(await getPhysicalNodeLinks(config, childNodePath, order))
    }
  }
  return result
}

export async function getNodeLinks(config: DatabaseConfig, getDocument: GetExpandedDocument, nodePath: NodePath,
                                   order?: ListOrder, columns?: DataColumn[]): Promise<RecordLink[]> {
  const type = nodePath.type
  const union = type?.union || []
  const id = nodePath.schema?.id
  const items = union.length > 0 && id
    ? await getUnionNodeLinks(config, union, id, order)
    : await getPhysicalNodeLinks(config, nodePath, order)

  const expandedItems = await expandFields({ config, getDocument, nodePath }, items, columns)
  return sortLinks(order, expandedItems)
}

export async function getIndex(config: DatabaseConfig, getDocument: GetExpandedDocument, nodePath: NodePath): Promise<IndexNode> {
  const id = nodePath.path
  const documents = nodePath.schema?.documents
  const typeName = nodePath?.type?.id
  const document = documents && typeName ? documents[typeName] : undefined
  const columns = document?.index?.columns
  const items = await getNodeLinks(config, getDocument, nodePath, undefined, columns)

  return {
    type: 'index',
    id,
    title: nodePath.type?.title || nodePath.schema?.title,
    dataType: nodePath.type,
    items,
    columns,
    breadcrumbs: getBreadcrumbs(nodePath),
  }
}
