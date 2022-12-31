import { capitalizeFirstLetter, idFromPath } from '../../string-formatting'
import { isExistingDirectory, joinPaths, listFiles } from '../../file-operations'
import { GetIndexResponse, LinkRecord } from 'tome-common'

const newChildLink = (basePath: string) => async (file: string): Promise<LinkRecord> => {
  const shortPath = idFromPath(file)

  return {
    title: capitalizeFirstLetter(shortPath),
    path: shortPath,
    isDirectory: await isExistingDirectory(joinPaths(basePath, file)),
  }
}

export async function getIndex(filePath: string): Promise<GetIndexResponse> {
  const files = await listFiles(filePath)
  const items = await Promise.all(files.map(newChildLink(filePath)))

  return {
    type: 'index',
    id: idFromPath(filePath),
    items,
  }
}
