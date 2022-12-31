import { Endpoints, ExpandedDocument, PostDocumentRequest } from 'tome-common'
import axios from 'axios'

export type DocumentSaver = (document: ExpandedDocument) => Promise<void>

export const saveDocument: DocumentSaver = async document => {
  const request: PostDocumentRequest = { document }
  const response = await axios.post(`/api${Endpoints.nodeSet}`, request)
}
