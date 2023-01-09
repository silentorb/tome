import { AdvancedNodePath, DatabaseConfig, ListDiff, NodePath } from '../types'
import { batchProcess, writeFile } from '../file-operations'
import { getMarkdownDocumentFilePath, getNodePath } from '../pathing'
import { DocumentList, ExpandedDocument, RecordLink } from '@tome/data-api'
import { generateDocumentAppendingAst, generateMarkdown } from '../markdown-generation'
import path from 'path'
import { getDocument } from '../reading/get-document'
import { diffListLinks, getAllDiffKeys, StringListDiff, StringListDiffs } from '../diffing'
import { deepClonePlainData } from '../cloning'

export interface WriteDocumentProps {
  nodePath: NodePath
  document: ExpandedDocument
}

async function stringifyDocument(nodePath: NodePath, document: ExpandedDocument) {
  const additionalContent = await generateMarkdown(
    generateDocumentAppendingAst(path.dirname(nodePath.path), document)
  )

  return `${document.content}\n${additionalContent}`
}

function getOrCreateListItems(lists: DocumentList[], name: string, type?: string): RecordLink[] {
  const existing = lists.filter(list => list.name == name)[0]
  if (existing)
    return existing.items

  const newList: DocumentList = {
    name,
    type,
    items: [],
  }

  lists.push(newList)

  return newList.items
}

const applyOtherDocumentDiffs = async (config: DatabaseConfig, nodePath: AdvancedNodePath, diffs: StringListDiffs, source: ExpandedDocument): Promise<ExpandedDocument> => {
  const document = deepClonePlainData(source)
  const lists = document.lists
  const selfLink: RecordLink = {
    title: nodePath.title,
    id: nodePath.path,
  }
  for (const [key, diff] of diffs) {
    const items = getOrCreateListItems(lists, key, nodePath.structure?.name)

    // Additions
    for (const addition of diff.additions) {
      if (!items.some(item => item.id == addition)) {
        items.push(selfLink)
      }
    }

    // Subtractions
    for (const subtraction of diff.additions) {
      const index = items.findIndex(item => item.id == subtraction)
      if (index != -1) {
        items.splice(index, 1)
      }
    }
  }
  return document
}

const getDiffJobs = (config: DatabaseConfig, referenceNodePath: AdvancedNodePath, diffs: StringListDiffs) => async (key: string): Promise<FileWriteJob[]> => {
  const secondNodePath = getNodePath(config, key)
  const document = await getDocument(config, secondNodePath)
  if (!document)
    return [] // TODO: Create new document once there is a UI to create such situations

  const modifiedDocument = await applyOtherDocumentDiffs(config, referenceNodePath, diffs, document)
  const content = await stringifyDocument(secondNodePath, modifiedDocument);
  return [
    {
      filePath: getMarkdownDocumentFilePath(secondNodePath),
      content,
    }
  ]
}

interface FileWriteJob {
  filePath: string
  content: string
}

async function getDocumentDiffs(config: DatabaseConfig, nodePath: AdvancedNodePath, document: ExpandedDocument): Promise<FileWriteJob[]> {
  const previousDocument = await getDocument(config, nodePath)
  const diffs = diffListLinks(previousDocument?.lists || [], document.lists)
  const nodes = getAllDiffKeys(diffs)
  const results = await batchProcess(nodes, getDiffJobs(config, nodePath, diffs))
  return results.flat()
}

export const writeDocument = (config: DatabaseConfig) => async (props: WriteDocumentProps) => {
  const { nodePath, document } = props
  const filePath = getMarkdownDocumentFilePath(nodePath)
  const content = await stringifyDocument(nodePath, document);
  console.log(content)

  const nodePathWithTitle = {
    ...nodePath,
    title: nodePath.nodeName || 'Unknown',
  }

  const otherFiles = await getDocumentDiffs(config, nodePathWithTitle, document)
  const jobs = [{ filePath, content }].concat(otherFiles)
  await batchProcess(jobs, ({ filePath, content }) =>
    writeFile(filePath, content)
  )
}
