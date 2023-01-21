import { isExistingDirectory } from '../file-operations'
import { getDataSourceIndex, getIndex } from './get-index'
import { loadDocumentNode } from './get-document'
import { DatabaseConfig } from '../types'
import { getMarkdownDocumentFilePath, getNodeFilePath, getNodePath } from '../pathing'

export const loadNode = (config: DatabaseConfig) => async (resourcePath: string) => {
  const nodePath = getNodePath(config, resourcePath)
  if (!nodePath.source) {
    return getDataSourceIndex(config)
  }
  const isDirectory = await isExistingDirectory(getNodeFilePath(nodePath))
  if (isDirectory) {
    return getIndex(config, nodePath)
  } else {
    const result = await loadDocumentNode(config, nodePath)
    if (!result)
      throw new Error(`Could not find open ${getMarkdownDocumentFilePath(nodePath)}`)

    return result
  }
}
