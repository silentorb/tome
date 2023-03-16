import { DatabaseConfig, GetExpandedDocument, NodePath, WriteFileJob } from '../types'
import { batchProcess, deleteFile, getFileInfo, writeFile } from '../file-operations'
import { getMarkdownDocumentFilePath, getNodePathOrError } from '../pathing'
import { ExpandedDocument, RecordLink } from '@tome/data-api'
import { getPropagatedDocumentChanges } from './diffing-application'
import { refineAndStringifyDocument, stringifyIndex } from '../documents'
import { newDocumentCache } from '../reading'

export interface WriteDocumentProps {
  nodePath: NodePath
  document: ExpandedDocument
  oldNodePath?: NodePath
}

export const writeDocument = (config: DatabaseConfig, getDocument: GetExpandedDocument = newDocumentCache(config)) => async (props: WriteDocumentProps) => {
  const { nodePath, document, oldNodePath } = props
  const inputNodePath = oldNodePath || nodePath
  const content = await refineAndStringifyDocument(inputNodePath, document)

  const nodePathWithTitle = {
    ...nodePath,
    title: document.title,
  }

  const filePath = getMarkdownDocumentFilePath(nodePath)
  const otherFiles = await getPropagatedDocumentChanges(config, getDocument, oldNodePath, nodePathWithTitle, document.lists)
  const jobs = [{ filePath, content }].concat(otherFiles)

  if (oldNodePath) {
    await deleteFile(getMarkdownDocumentFilePath(oldNodePath))
  }

  await batchProcess(jobs, ({ filePath, content }) =>
    writeFile(filePath, content)
  )
}

const getMissingIndexChildFiles = async (config: DatabaseConfig, nodePath: NodePath, items: RecordLink[]): Promise<WriteFileJob[]> => {
  const result: WriteFileJob[] = []
  for (const item of items) {
    const childNodePath = getNodePathOrError(config, item.id)
    const filePath = getMarkdownDocumentFilePath(childNodePath)
    const info = await getFileInfo(filePath)
    if (!info) {
      result.push({
        filePath,
        content: `# ${item.title}\n`
      })
    }
  }

  return result
}

export const writeIndexDocument = (config: DatabaseConfig) => async (nodePath: NodePath, items: RecordLink[]) => {
  const filePath = getMarkdownDocumentFilePath(nodePath)
  const content = await stringifyIndex(nodePath, items)
  const missingFileJobs = await getMissingIndexChildFiles(config, nodePath, items)
  const jobs = [{ filePath, content }].concat(missingFileJobs)
  await batchProcess(jobs, ({ filePath, content }) =>
    writeFile(filePath, content)
  )
}

export const deleteDocument = (config: DatabaseConfig, getDocument: GetExpandedDocument = newDocumentCache(config)) => async (nodePath: NodePath) => {
  const filePath = getMarkdownDocumentFilePath(nodePath)
  const jobs = await getPropagatedDocumentChanges(config, getDocument, nodePath, undefined, [])
  await batchProcess(jobs, ({ filePath, content }) =>
    writeFile(filePath, content)
  )
  await deleteFile(filePath)
}
