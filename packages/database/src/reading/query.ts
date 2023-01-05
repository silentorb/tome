import { DatabaseConfig } from '../types'
import { DataQuery, Node } from '@tome/data-api'
import { getDefaultDataSource } from '../database'
import { getStructureByName } from '../pathing'

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
