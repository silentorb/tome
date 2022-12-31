import { isExistingDirectory, joinPaths, listFiles } from '../file-operations'
import { idFromPath } from '../resource-mapping'
import { IndexNode, RecordLink } from '@tome/data-api'

const newChildLink = (parentId: string, basePath: string) => async (file: string): Promise<RecordLink> => {
  const shortPath = idFromPath(file)

  return {
    title: shortPath,
    id: joinPaths(parentId, shortPath),
    isDirectory: await isExistingDirectory(joinPaths(basePath, file)),
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
