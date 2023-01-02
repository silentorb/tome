import { Endpoints, PostDocumentRequest } from '@tome/web-api'
import axios from 'axios'

export type DocumentSaver = (request: PostDocumentRequest) => Promise<void>

export const saveDocument: DocumentSaver = async request => {
  const response = await axios.post(`/api${Endpoints.nodeSet}`, request)
}
