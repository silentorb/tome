import { DatabaseConfig, NodePath } from '../types'
import { writeFile } from '../file-operations'
import { getMarkdownDocumentFilePath } from '../pathing'
import { ExpandedDocument } from '@tome/data-api'
import { generateDocumentAppendingAst, generateMarkdown } from '../markdown-generation'
import path from 'path'

export interface WriteDocumentProps {
  nodePath: NodePath
  document: ExpandedDocument
}

export const writeDocument = (config: DatabaseConfig) => async (props: WriteDocumentProps) => {
  const { nodePath, document } = props
  const filePath = getMarkdownDocumentFilePath(nodePath)
  // const previousNode = await getDocument(config, nodePath, filePath)

  const additionalContent = await generateMarkdown(
    generateDocumentAppendingAst(path.dirname(nodePath.path), document)
  )

  const finalContent = `${document.content}\n${additionalContent}`
  console.log(finalContent)

  await writeFile(filePath, finalContent)
}
