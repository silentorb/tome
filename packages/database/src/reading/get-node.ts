import { isExistingDirectory, joinPaths } from '../file-operations'
import { getDataSourceIndex, getIndex } from './get-index'
import { getDocument } from './get-document'
import { DatabaseConfig } from '../types'
import { getNodeFilePath, getNodePath } from '../pathing'

export const loadNode = (config: DatabaseConfig) => async (resourcePath: string) => {
  const nodePath = getNodePath(config, resourcePath)
  if (!nodePath.source) {
    return getDataSourceIndex(config)
  }
  const baseFilePath = getNodeFilePath(nodePath)
  const isDirectory = await isExistingDirectory(baseFilePath)
  if (isDirectory) {
    return getIndex(resourcePath, baseFilePath)
  } else {
    return getDocument(config, nodePath, `${baseFilePath}.md`)
  }
}
