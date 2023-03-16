import { DeleteNodeRequest, EndpointPaths, PutNodeRequest } from '@tome/web-api'
import axios from 'axios'

export type NodeSaver = (request: PutNodeRequest) => Promise<void>

export const saveDocument: NodeSaver = async request => {
  const response = await axios.put(`/api${EndpointPaths.nodeSet}`, request)
}

export type NodeDeleter = (request: DeleteNodeRequest) => Promise<void>

export const deleteDocument: NodeDeleter = async request => {
  const response = await axios.delete(`/api/nodes/${request.id}`)
}
