import { readFile } from '../../file-operations'
import { GetDocumentResponse } from 'tome-common'
import { idFromPath } from '../../string-formatting'

export async function getDocument(id: string, filePath: string): Promise<GetDocumentResponse> {
  const content = await readFile(filePath)
  if (content) {
    return {
      type: 'document',
      document: {
        id,
        content,
      },
    }
  } else {
    throw new Error('Could not find file and proper error handling for this is not yet implemented.')
  }
}
