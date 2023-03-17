import { DeleteNodeRequest, EndpointPaths, PutNodeRequest } from '@tome/web-api'
import axios from 'axios'
import { withError } from './utility'

export type NodeSaver = (request: PutNodeRequest) => Promise<void>

export const saveDocument: NodeSaver = async request => {
  withError(await axios.put(`/api${EndpointPaths.nodeSet}`, request))
}

export type NodeDeleter = (request: DeleteNodeRequest) => Promise<void>

export const deleteDocument: NodeDeleter = async request => {
  withError(await axios.delete(`/api/nodes/${request.id}`))
}
