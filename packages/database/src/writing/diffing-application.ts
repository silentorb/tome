import { AdvancedNodePath, DatabaseConfig, FileWriteJob } from '../types'
import { DocumentList, ExpandedDocument, Property, RecordLink, TypeDefinition, TypeReference } from '@tome/data-api'
import { deepClonePlainData } from '../cloning'
import { getMarkdownDocumentFilePath, getNodePath } from '../pathing'
import { loadExpandedDocument } from '../reading'
import { StringListDiffs } from '../diffing'
import { getListItems, stringifyDocument } from '../documents'
import { getReferencedTypeName } from '../type-processing'
import { isListType } from '../schema'

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
  otherNodePath: AdvancedNodePath, diffs: StringListDiffs,
  source: ExpandedDocument, oldOther?: string): Promise<ExpandedDocument> => {
  const document = deepClonePlainData(source)
  const lists = document.lists
  const crossLink: RecordLink = {
    title: otherNodePath.title,
    id: otherNodePath.path,
  }
  const structure = nodePath.type
  if (!structure)
    return document

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

  if (oldOther) {
    for (const list of lists) {
      for (const item of list.items) {
        if (item.id == oldOther) {
          item.id = otherNodePath.path
          item.title = otherNodePath.title
        }
      }
    }
  }

  return document
}

export const getDiffJobs = (config: DatabaseConfig, oldOther: string | undefined, otherNodePath: AdvancedNodePath, diffs: StringListDiffs) => async (key: string): Promise<FileWriteJob[]> => {
  const nodePath = await getNodePath(config, key)
  if (!nodePath)
    return []

  const document = await loadExpandedDocument(config, nodePath)
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
