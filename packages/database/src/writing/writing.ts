import { AdvancedNodePath, DatabaseConfig, FileWriteJob, NodePath } from '../types'
import { batchProcess, writeFile } from '../file-operations'
import { getMarkdownDocumentFilePath } from '../pathing'
import { ExpandedDocument, IndexNode, RecordLink } from '@tome/data-api'
import { loadExpandedDocument } from '../reading'
import { diffListLinks, getAllDiffKeys,  } from '../diffing'
import { getDiffJobs } from './diffing-application'
import { stringifyDocument, stringifyIndex } from '../documents'

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
  const content = await stringifyDocument(nodePath, document);

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

export const writeIndexDocument = (config: DatabaseConfig) => async (nodePath: NodePath, node: IndexNode) => {
  const filePath = getMarkdownDocumentFilePath(nodePath)
  const content = await stringifyIndex(nodePath, node)
  //
  // const nodePathWithTitle = {
  //   ...nodePath,
  //   title: document.title,
  // }
  //
  // const otherFiles = await getDocumentDiffs(config, nodePathWithTitle, document)
  const jobs = [{ filePath, content }]//.concat(otherFiles)
  await batchProcess(jobs, ({ filePath, content }) =>
    writeFile(filePath, content)
  )
}
