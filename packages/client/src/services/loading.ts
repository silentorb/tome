import axios from 'axios'
import { GetNodeProps, ResourceLoader } from './types'
import { Endpoints, GetNodeResponse } from '@tome/web-api'


export const loadNode: ResourceLoader<GetNodeResponse> = async id => {
  const response = await axios.post(`/api${Endpoints.nodeGet}`, { id })
  return response.data
}

export const loadNodeContainer: ResourceLoader<GetNodeProps> = async id => {
  return loadNode(id)
}
