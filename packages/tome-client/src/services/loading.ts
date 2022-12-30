import { ExpandedDocument, Get, NodeContainer } from 'tome-common'
import axios from 'axios'
import { GetNodeProps, ResourceLoader } from './types'


export const loadNode: ResourceLoader<NodeContainer> = async id => {
  const response = await axios.post(`/api/node/query`, { id, })
  return response.data
}

export const loadNodeContainer: ResourceLoader<GetNodeProps> = async id => {
  const container = await loadNode(id)
  return {
    container
  }
}
