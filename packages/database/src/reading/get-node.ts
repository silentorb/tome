import { isExistingDirectory } from '../file-operations'
import { getDataSourceIndex, getIndex } from './get-index'
import { loadDocumentNode } from './get-document'
import { DatabaseConfig } from '../types'
import { getMarkdownDocumentFilePath, getNodePathOrError, isDataSource } from '../pathing'

export const loadNode = (config: DatabaseConfig) => async (resourcePath: string) => {
  const nodePath = getNodePathOrError(config, resourcePath)
  if (!nodePath.schema && nodePath.nodeName == 'index') {
    return getDataSourceIndex(config)
  }

  if (nodePath.nodeName == 'index' || isDataSource(nodePath) || await isExistingDirectory(nodePath.filePath)) {
    return getIndex(config, nodePath)
  } else {
    const result = await loadDocumentNode(config, nodePath)
    if (!result)
      throw new Error(`Could not find open ${getMarkdownDocumentFilePath(nodePath)}`)

    return result
  }
}
