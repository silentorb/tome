import { ExpandedDocument } from 'tome-common'

export type DocumentSaver = (document: ExpandedDocument) => Promise<void>

export const saveDocument: DocumentSaver = async document => {

}
