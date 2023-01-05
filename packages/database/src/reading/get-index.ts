import { isExistingDirectory, joinPaths, listFiles } from '../file-operations'
import { IndexNode, RecordLink } from '@tome/data-api'
import { DatabaseConfig } from '../types'
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


export async function getIndex(id: string, filePath: string): Promise<IndexNode> {
  const files = await listFiles(filePath)
  const items = await Promise.all(files.map(newChildLink(id, filePath)))

  return {
    type: 'index',
    id,
    items,
  }
}
