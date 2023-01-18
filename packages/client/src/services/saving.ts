import { EndpointPaths, PutNodeRequest } from '@tome/web-api'
import axios from 'axios'

export type NodeSaver = (request: PutNodeRequest) => Promise<void>

export const saveDocument: NodeSaver = async request => {
  const response = await axios.post(`/api${EndpointPaths.nodeSet}`, request)
}
