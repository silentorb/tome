import { isExistingDirectory } from '../file-operations'
import { getIndex } from './get-index'
import { getDocument } from './get-document'
import { DatabaseConfig } from '../types'
import { getDocumentFilePath } from '../resource-mapping'

export const loadNode = (config: DatabaseConfig) => async (id: string) => {
  const baseFilePath = getDocumentFilePath(config, id)
  const isDirectory = await isExistingDirectory(baseFilePath)
  if (isDirectory) {
   return getIndex(id, baseFilePath)
  } else {
   return getDocument(id, `${baseFilePath}.md`)
  }
}
