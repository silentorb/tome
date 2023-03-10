import { DatabaseConfig, GetExpandedDocument } from '../types'
import { ExpandedDocument } from '@tome/data-api'
import { loadExpandedDocument } from './get-document'
import { getNodePath } from '../pathing'

export function newDocumentCache(config: DatabaseConfig): GetExpandedDocument {
  const cache: { [key: string]: ExpandedDocument | undefined } = {}
  return async id => {
    if (id in cache)
      return cache[id]

    const nodePath = getNodePath(config, id)
    const value = nodePath ? await loadExpandedDocument(config, nodePath) : undefined
    cache[id] = value
    return value
  }
}
