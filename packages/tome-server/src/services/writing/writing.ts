import { writeFile } from '../../file-operations'
import { ServerConfig } from '../../types'
import { DefaultContext } from 'koa'
import { getMarkdownDocumentFilePath } from '../../string-formatting'
import { PostDocumentRequest } from 'tome-common'

export type DocumentWriter = (config: ServerConfig) => (context: DefaultContext) => Promise<void>

export const writeDocument: DocumentWriter = config => async context => {
  const body = context.request.body as PostDocumentRequest
  const { id, content } = body.document
  const filePath = getMarkdownDocumentFilePath(config, id)
  console.log()
  await writeFile(filePath, content)
}
