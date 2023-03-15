import { isExistingDirectory } from '../file-operations'
import { getDataSourceIndex, getIndex } from './get-index'
import { DatabaseConfig, GetExpandedDocument } from '../types'
import { getMarkdownDocumentFilePath, getNodePath, isDataSource } from '../pathing'
import { newDocumentCache } from './document-cache'
import { loadDocumentNode } from './get-document'
import { Node } from '@tome/data-api'

export const loadNode = (config: DatabaseConfig, getDocument: GetExpandedDocument = newDocumentCache(config)) => async (resourcePath: string): Promise<Node | undefined> => {
  if (resourcePath === '')
    return getDataSourceIndex(config)

  const nodePath = await getNodePath(config, resourcePath)
  if (!nodePath)
    return undefined

  if (!nodePath.nodeName || isDataSource(nodePath) || (nodePath.filePath && await isExistingDirectory(nodePath.filePath))) {
    return getIndex(config, getDocument, nodePath)
  } else {
    const result = await loadDocumentNode(getDocument, nodePath)
    if (!result)
      throw new Error(`Could not find open ${getMarkdownDocumentFilePath(nodePath)}`)

    return result
  }
}
