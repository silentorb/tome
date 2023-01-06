import { DatabaseConfig } from '../types'
import { DataQuery, RecordLink } from '@tome/data-api'
import { getNodePath } from '../pathing'
import { joinPaths } from '../file-operations'
import { BadRequest } from '@vineyard/lawn'
import { getNodeLinks } from './get-index'

export const queryNodes = (config: DatabaseConfig) => async (query: DataQuery): Promise<RecordLink[]> => {
  if (!query?.filters?.length)
    throw new Error('Unfiltered queries are not supported')

  const filter = query.filters[0]
  if (filter.key != 'type')
    throw new Error('Currently only filtering by node type is supported')

  const type = query.filters[0].value

  const nodePath = getNodePath(config, type)
  if (!nodePath.source)
    throw new BadRequest('Invalid data source in filter type path')

  if (!nodePath.nodeName)
    throw new BadRequest('Invalid type in filter')

  const filePath = joinPaths(nodePath.source!.filePath, nodePath.nodeName)
  const items = await getNodeLinks(type, filePath)

  return items
}
