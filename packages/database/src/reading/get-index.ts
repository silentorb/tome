import { isExistingDirectory, joinPaths, listFiles } from '../file-operations'
import { IndexNode, RecordLink } from '@tome/data-api'
import { DatabaseConfig, NodePath } from '../types'
import { childNodePath, getIndexDirectoryPath, getNodeFilePath, idFromPath } from '../pathing'
import { loadDocumentContent, loadDocumentTitle } from './get-document'
import { expandIndexList, recordLinkListsHaveSameOrder, sortRecordLinks } from '../documents'
import { writeIndexDocument } from '../writing'

const newChildLink = (config: DatabaseConfig) => async (nodePath: NodePath): Promise<RecordLink> => {
  const title = await loadDocumentTitle(config, nodePath)

  return {
    title,
    id: nodePath.path,
    isDirectory: await isExistingDirectory(getNodeFilePath(nodePath)),
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
  const indexNodePath = {
    ...nodePath,
    path: `${nodePath.path}/index`,
    nodeName: 'index',
  }
  const content = await loadDocumentContent(config, indexNodePath)
  return content ? expandIndexList(config, indexNodePath, content) : []
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

export async function getNodeLinks(config: DatabaseConfig, nodePath: NodePath): Promise<RecordLink[]> {
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
    const sortedList = sortRecordLinks(newList)
    if (changed || !recordLinkListsHaveSameOrder(newList, sortedList)) {
      await writeIndexDocument(config)(nodePath, sortedList)
    }
    return sortedList
  } else {
    return sortRecordLinks(directoryLinks)
  }
}

export async function getIndex(config: DatabaseConfig, nodePath: NodePath): Promise<IndexNode> {
  const id = nodePath.path
  const items = await getNodeLinks(config, nodePath)

  return {
    type: 'index',
    id,
    dataType: nodePath.type,
    items,
  }
}
