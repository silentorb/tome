import { isExistingDirectory } from '../file-operations'
import { getDataSourceIndex, getIndex } from './get-index'
import { getDocumentNode } from './get-document'
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
    const result = await getDocumentNode(config, nodePath)
    if (!result)
      throw new Error('Could not find document file and proper error handling for this is not yet implemented.')

    return result
  }
}
