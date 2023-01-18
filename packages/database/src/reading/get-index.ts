import { isExistingDirectory, joinPaths, listFiles } from '../file-operations'
import { IndexNode, RecordLink } from '@tome/data-api'
import { DatabaseConfig, NodePath } from '../types'
import { idFromPath } from '../pathing'

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

export async function getNodeLinks(id: string, filePath: string): Promise<RecordLink[]> {
  const files = await listFiles(filePath)
  return Promise.all(files.map(newChildLink(id, filePath)))
}

export async function getIndex(nodePath: NodePath, filePath: string): Promise<IndexNode> {
  const id = nodePath.path
  const items = await getNodeLinks(id, filePath)

  return {
    type: 'index',
    id,
    structure: nodePath.structure,
    items,
  }
}
