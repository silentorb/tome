import { Endpoints, ExpandedDocument, Get, GetNodeResponse } from 'tome-common'
import axios from 'axios'
import { GetNodeProps, ResourceLoader } from './types'


export const loadNode: ResourceLoader<GetNodeResponse> = async id => {
  const response = await axios.post(`/api${Endpoints.nodeGet}`, { id })
  return response.data
}

export const loadNodeContainer: ResourceLoader<GetNodeProps> = async id => {
  const container = await loadNode(id)
  return {
    container
  }
}
