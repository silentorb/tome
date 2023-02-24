import { isExistingDirectory } from '../file-operations'
import { getDataSourceIndex, getIndex } from './get-index'
import { loadDocumentNode } from './get-document'
import { DatabaseConfig } from '../types'
import { getMarkdownDocumentFilePath, getNodePath, isDataSource } from '../pathing'

export const loadNode = (config: DatabaseConfig) => async (resourcePath: string) => {
  if (resourcePath === '')
    return getDataSourceIndex(config)

  const nodePath = await getNodePath(config, resourcePath)
  if (!nodePath)
    return undefined

  if (!nodePath.nodeName || isDataSource(nodePath) || await isExistingDirectory(nodePath.filePath)) {
    return getIndex(config, nodePath)
  } else {
    const result = await loadDocumentNode(config, nodePath)
    if (!result)
      throw new Error(`Could not find open ${getMarkdownDocumentFilePath(nodePath)}`)

    return result
  }
}
