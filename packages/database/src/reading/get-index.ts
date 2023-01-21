import { isExistingDirectory, joinPaths, listFiles } from '../file-operations'
import { IndexNode, RecordLink } from '@tome/data-api'
import { DatabaseConfig, NodePath } from '../types'
import { getNodeFilePath, idFromPath } from '../pathing'
import { loadDocumentContent } from './get-document'
import { expandIndexList } from '../documents'

const newChildLink = (parentId: string, basePath: string) => async (file: string): Promise<RecordLink> => {
  const shortPath = idFromPath(file)

  return {
    title: shortPath,
    id: joinPaths(parentId, shortPath),
    isDirectory: await isExistingDirectory(joinPaths(basePath, file)),
  }
}

export function getDataSourceIndex(config: DatabaseConfig): IndexNode {
  const items = Object.entries(config.sources)
    .map(([key, value]) => ({
      title: key,
      id: key,
      isDirectory: true,
    }))

  return {
    type: 'index',
    id: '',
    items,
  }
}

async function loadIndexList(config: DatabaseConfig, nodePath: NodePath) {
  const indexNodePath = {
    ...nodePath,
    path: `${nodePath.path}/index`,
    nodeName: 'index',
  }
  const content = await loadDocumentContent(config, indexNodePath)
  return content ? expandIndexList(config, indexNodePath, content) : []
}

export async function getNodeLinks(config: DatabaseConfig, nodePath: NodePath): Promise<RecordLink[]> {
  const id = nodePath.path
  const filePath = getNodeFilePath(nodePath)
  const files = await listFiles(filePath)
  const withoutIndex = files.filter(f => f != 'index.md')
  const hasIndex = withoutIndex.length < files.length

  if (hasIndex) {
    return loadIndexList(config, nodePath)
  }
  return await Promise.all(withoutIndex.map(newChildLink(id, filePath)))
}

export async function getIndex(config: DatabaseConfig, nodePath: NodePath): Promise<IndexNode> {
  const id = nodePath.path
  const items = await getNodeLinks(config, nodePath)

  return {
    type: 'index',
    id,
    structure: nodePath.structure,
    items,
  }
}
