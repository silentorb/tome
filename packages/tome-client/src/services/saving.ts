import { ExpandedDocument } from 'tome-common'
import axios from 'axios'

export type DocumentSaver = (document: ExpandedDocument) => Promise<void>

export const saveDocument: DocumentSaver = async document => {
  const response = await axios.post(`/api/node/save`, { document })
}
