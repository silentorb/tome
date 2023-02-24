import { AdvancedNodePath, DatabaseConfig, FileWriteJob, NodePath } from '../types'
import { batchProcess, getFileInfo, writeFile } from '../file-operations'
import { getMarkdownDocumentFilePath, getNodePathOrError } from '../pathing'
import { ExpandedDocument, RecordLink } from '@tome/data-api'
import { loadExpandedDocument } from '../reading'
import { diffListLinks, getAllDiffKeys, } from '../diffing'
import { getDiffJobs } from './diffing-application'
import { refineAndStringifyDocument, stringifyIndex } from '../documents'

export interface WriteDocumentProps {
  nodePath: NodePath
  document: ExpandedDocument
}

async function getDocumentDiffs(config: DatabaseConfig, nodePath: AdvancedNodePath, document: ExpandedDocument): Promise<FileWriteJob[]> {
  const previousDocument = await loadExpandedDocument(config, nodePath)
  const diffs = diffListLinks(previousDocument?.lists || [], document.lists)
  const nodes = getAllDiffKeys(diffs)
  const results = await batchProcess(nodes, getDiffJobs(config, nodePath, diffs))
  return results.flat()
}

export const writeDocument = (config: DatabaseConfig) => async (props: WriteDocumentProps) => {
  const { nodePath, document } = props
  const filePath = getMarkdownDocumentFilePath(nodePath)
  const content = await refineAndStringifyDocument(nodePath, document)

  const nodePathWithTitle = {
    ...nodePath,
    title: document.title,
  }

  const otherFiles = await getDocumentDiffs(config, nodePathWithTitle, document)
  const jobs = [{ filePath, content }].concat(otherFiles)
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
