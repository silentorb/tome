import { AdvancedNodePath, DatabaseConfig, FileWriteJob, NodePath } from '../types'
import { batchProcess, deleteFile, getFileInfo, writeFile } from '../file-operations'
import { getMarkdownDocumentFilePath, getNodePathOrError } from '../pathing'
import { ExpandedDocument, RecordLink } from '@tome/data-api'
import { loadExpandedDocument } from '../reading'
import { diffListLinks, getAllDiffKeys, getAllListLinkKeys, } from '../diffing'
import { getDiffJobs } from './diffing-application'
import { refineAndStringifyDocument, stringifyIndex } from '../documents'
import { unique } from '../functional'

export interface WriteDocumentProps {
  nodePath: NodePath
  document: ExpandedDocument
  oldNodePath?: NodePath
}

async function getDocumentDiffs(config: DatabaseConfig, oldNodePath: NodePath | undefined,
                                nodePath: AdvancedNodePath, document: ExpandedDocument): Promise<FileWriteJob[]> {
  const inputNodePath = oldNodePath || nodePath
  const oldId = oldNodePath?.path
  const previousDocument = await loadExpandedDocument(config, inputNodePath)
  const previousLists = previousDocument?.lists || []
  const diffs = diffListLinks(previousLists, document.lists)
  const renameDiffs = getAllListLinkKeys(previousLists)
  const nodes = unique(getAllDiffKeys(diffs).concat(renameDiffs))
  const results = await batchProcess(nodes, getDiffJobs(config, oldId, nodePath, diffs))
  return results.flat()
}

export const writeDocument = (config: DatabaseConfig) => async (props: WriteDocumentProps) => {
  const { nodePath, document, oldNodePath } = props
  const inputNodePath = oldNodePath || nodePath
  const content = await refineAndStringifyDocument(inputNodePath, document)

  const nodePathWithTitle = {
    ...nodePath,
    title: document.title,
  }

  const filePath = getMarkdownDocumentFilePath(nodePath)
  const otherFiles = await getDocumentDiffs(config, oldNodePath, nodePathWithTitle, document)
  const jobs = [{ filePath, content }].concat(otherFiles)

  if (oldNodePath) {
    await deleteFile(getMarkdownDocumentFilePath(oldNodePath))
  }

  await batchProcess(jobs, ({ filePath, content }) =>
    writeFile(filePath, content)
  )
}

interface WriteFileJob {
  filePath: string
  content: string
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
