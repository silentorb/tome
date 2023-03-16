import { AdvancedNodePath, DatabaseConfig, WriteFileJob, NodePath, GetExpandedDocument } from '../types'
import { DocumentList, ExpandedDocument, Property, RecordLink, TypeDefinition } from '@tome/data-api'
import { deepClonePlainData } from '../cloning'
import { getMarkdownDocumentFilePath, getNodePath } from '../pathing'
import { loadExpandedDocument } from '../reading'
import { diffListLinks, getAllDiffKeys, getAllListLinkKeys, StringListDiffs } from '../diffing'
import { getListItems, stringifyDocument, stringifyIndex } from '../documents'
import { getReferencedTypeName, getTypeOrder } from '../type-processing'
import { isListType } from '../schema'
import { unique } from '../functional'
import { batchProcess } from '../file-operations'
import { getIndex } from '../reading/get-index'
import { sortLinks } from '@tome/data-processing'

export function getOrCreateListItems(lists: DocumentList[], property: Property): RecordLink[] {
  const existing = getListItems(lists, property.id)
  if (existing)
    return existing

  const newList: DocumentList = {
    title: property.title,
    id: property.id,
    type: getReferencedTypeName(property.type),
    items: [],
  }

  lists.push(newList)

  return newList.items
}

const isOtherProperty = (otherStructure: TypeDefinition, key: string) => (p: Property): boolean => {
  const reference = getReferencedTypeName(p.type)
  return (reference == otherStructure.id || otherStructure.unions.some(u => u.name == reference)) && (!p.otherProperty || p.otherProperty === key)
}

export const applyOtherDocumentDiffs = async (
  config: DatabaseConfig, nodePath: AdvancedNodePath,
  otherNodePath: AdvancedNodePath | undefined, diffs: StringListDiffs,
  source: ExpandedDocument, oldOther?: string): Promise<ExpandedDocument> => {
  const document = deepClonePlainData(source)
  const lists = document.lists
  const structure = nodePath.type
  if (!structure)
    return document

  if (otherNodePath) {
    const crossLink: RecordLink = {
      title: otherNodePath.title,
      id: otherNodePath.path,
    }
    const otherStructure = otherNodePath.type!
    for (const [key, diff] of diffs) {
      const property = Object.values(structure.properties)
        .filter(isOtherProperty(otherStructure, key))[0]

      if (!property)
        continue

      const items = getOrCreateListItems(lists, property)

      // Additions
      if (diff.additions.includes(nodePath.path)) {
        if (isListType(property.type)) {
          if (!items.some(item => item.id == crossLink.id)) {
            items.push(crossLink)
          }
        } else {
          items.length = 0
          items.push(crossLink)
        }
      }

      // Subtractions
      if (diff.removals.includes(nodePath.path)) {
        const index = items.findIndex(item => item.id == crossLink.id)
        if (index != -1) {
          items.splice(index, 1)
        }
      }
    }
  }

  if (oldOther) {
    for (const list of lists) {
      if (otherNodePath) {
        for (const item of list.items) {
          if (item.id == oldOther) {
            item.id = otherNodePath.path
            item.title = otherNodePath.title
          }
        }
      } else {
        list.items = list.items.filter(item => item.id != oldOther)
      }
    }
  }

  return document
}

export const getDiffJobs = (config: DatabaseConfig, getDocument: GetExpandedDocument, oldOther: string | undefined, otherNodePath: AdvancedNodePath | undefined,
                            diffs: StringListDiffs) => async (key: string): Promise<WriteFileJob[]> => {
  const nodePath = await getNodePath(config, key)
  if (!nodePath)
    return []

  const document = await getDocument(nodePath.path)
  if (!document)
    return []

  const advancedNodePath: AdvancedNodePath = {
    ...nodePath,
    title: document.title,
  }
  const modifiedDocument = await applyOtherDocumentDiffs(config, advancedNodePath, otherNodePath, diffs, document, oldOther)
  const content = await stringifyDocument(nodePath, modifiedDocument)
  return [
    {
      filePath: getMarkdownDocumentFilePath(nodePath),
      content,
    }
  ]
}

// In retrospect, it may be better to simply regenerate the index file instead of diffing it,
// because that would also synchronize any other potential discrepancies and would be simpler.
// Tome index files are not sources of truth and are servants of their surroundings.
export async function getPropagatedIndexChanges(config: DatabaseConfig, getDocument: GetExpandedDocument,
                                                parentId: string, oldId: string | undefined,
                                                newNodePath: AdvancedNodePath | undefined,
                                                titleChanged: boolean): Promise<WriteFileJob[]> {
  if (!oldId || !newNodePath || titleChanged) {
    const indexNodePath = getNodePath(config, parentId)
    if (!indexNodePath || !indexNodePath.type)
      return []

    const filePath = getMarkdownDocumentFilePath(indexNodePath)
    if (!filePath)
      return []

    const index = await getIndex(config, getDocument, indexNodePath)
    if (!index)
      return []

    let { items } = index
    if (!oldId && newNodePath) {
      // Add index entry for new document.
      items = sortLinks(getTypeOrder(config, indexNodePath.type), items.concat([{
        id: newNodePath.path,
        title: newNodePath.title,
      }]))
    } else if (oldId && !newNodePath) {
      // Remove index entry for deleted document.
      items = items.filter(item => item.id != oldId)
    }
    else if (newNodePath && titleChanged) {
      for (const item of items) {
        if (item.id == newNodePath?.path) {
          item.title = newNodePath.title
        }
      }
    }

    const content = await stringifyIndex(indexNodePath, items)
    return [{ filePath, content }]
  } else {
    return []
  }
}

export async function getPropagatedDocumentChanges(config: DatabaseConfig, getDocument: GetExpandedDocument, oldNodePath: NodePath | undefined,
                                                   newNodePath: AdvancedNodePath | undefined, lists: DocumentList[]): Promise<WriteFileJob[]> {
  const inputNodePath = oldNodePath || newNodePath
  if (!inputNodePath)
    throw new Error('Either old or new node path must be set')

  const oldId = oldNodePath?.path
  const parentId = `${inputNodePath?.schema?.id}/${inputNodePath?.type?.id}`
  const previousDocument = await loadExpandedDocument(config, inputNodePath)
  const titleChanged = !!newNodePath?.title && !!previousDocument?.title && newNodePath.title != previousDocument.title
  const previousLists = previousDocument?.lists || []
  const diffs = diffListLinks(previousLists, lists)
  const renameDiffs = getAllListLinkKeys(previousLists)
  const nodes = unique(getAllDiffKeys(diffs).concat(renameDiffs))
  const results = await batchProcess(nodes, getDiffJobs(config, getDocument, oldId, newNodePath, diffs))
  const indexChanges = await getPropagatedIndexChanges(config, getDocument, parentId, oldId, newNodePath, titleChanged)
  return results.flat().concat(indexChanges)
}
