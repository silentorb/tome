import axios from 'axios'
import { GetNodeProps, ResourceLoader } from './types'
import { EndpointPaths, GetNodeLinksResponse, GetNodeResponse } from '@tome/web-api'
import { apiUrl } from './utility'
import { DataQuery } from '@tome/data-api'


export const loadNode: ResourceLoader<GetNodeResponse> = async id => {
  const response = await axios.post(apiUrl(EndpointPaths.nodeGet), { id })
  return response.data
}

export const loadNodeContainer: ResourceLoader<GetNodeProps> = async id => {
  return loadNode(id)
}

export const loadNodesOfType: ResourceLoader<GetNodeLinksResponse> = async type => {
  const query: DataQuery = {
    filters: [
      {
        key: 'type',
        value: type,
      },
    ],
  }

  const response = await axios.post(apiUrl(EndpointPaths.nodeQuery), query)
  return response.data
}
