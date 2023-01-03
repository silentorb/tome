import { isExistingDirectory } from '../file-operations'
import { getIndex } from './get-index'
import { getDocument } from './get-document'
import { DatabaseConfig } from '../types'
import { getDocumentFilePath } from '../resource-mapping'
import { DataQuery, Node } from '@tome/data-api'
import { getStructureByName } from '../documents'
import { getDefaultDataSource } from '../database'

export const loadNode = (config: DatabaseConfig) => async (id: string) => {
  const baseFilePath = getDocumentFilePath(config, id)
  const isDirectory = await isExistingDirectory(baseFilePath)
  if (isDirectory) {
    return getIndex(id, baseFilePath)
  } else {
    return getDocument(config, id, `${baseFilePath}.md`)
  }
}

export const queryNodes = (config: DatabaseConfig) => async (query: DataQuery): Promise<Node[]> => {
  if (!query?.filters?.length)
    throw new Error('Unfiltered queries are not supported')

  const filter = query.filters[0]
  if (filter.key != 'type')
    throw new Error('Currently only filtering by node type is supported')

  const type = query.filters[0].value

  const structure = getStructureByName(getDefaultDataSource(config).schema, type)

  return []
  // const baseFilePath = getDocumentFilePath(config, id)
  // const isDirectory = await isExistingDirectory(baseFilePath)
  // if (isDirectory) {
  //   return getIndex(id, baseFilePath)
  // } else {
  //   return getDocument(config, id, `${baseFilePath}.md`)
  // }
}
