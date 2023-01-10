import { AdvancedNodePath, DatabaseConfig, FileWriteJob } from '../types'
import { DocumentList, ExpandedDocument, Property, RecordLink } from '@tome/data-api'
import { deepClonePlainData } from '../cloning'
import { geAdvancedNodePath, getMarkdownDocumentFilePath } from '../pathing'
import { getDocument } from '../reading'
import { StringListDiffs } from '../diffing'
import { stringifyDocument } from '../documents'

export function getPropertyReferenceType(property: Property): string | undefined {
  if (typeof property.type === 'object') {
    const {types} = property.type
    return types[types.length - 1]
  }
  return undefined
}

export function getOrCreateListItems(lists: DocumentList[], property: Property): RecordLink[] {
  const existing = lists.filter(list => list.name == property.displayName)[0]
  if (existing)
    return existing.items

  const newList: DocumentList = {
    name: property.displayName,
    type: getPropertyReferenceType(property),
    items: [],
  }

  lists.push(newList)

  return newList.items
}

export const applyOtherDocumentDiffs = async (
  config: DatabaseConfig, nodePath: AdvancedNodePath,
  otherNodePath: AdvancedNodePath, diffs: StringListDiffs,
  source: ExpandedDocument): Promise<ExpandedDocument> => {
  const document = deepClonePlainData(source)
  const lists = document.lists
  const selfLink: RecordLink = {
    title: otherNodePath.title,
    id: otherNodePath.path,
  }
  const structure = nodePath.structure
  const otherStructure = otherNodePath.structure!
  for (const [key, diff] of diffs) {
    const property = structure?.properties.filter(p => getPropertyReferenceType(p) == otherStructure.path)[0]
    if (!property)
      continue

    const items = getOrCreateListItems(lists, property)

    // Additions
    for (const addition of diff.additions) {
      if (!items.some(item => item.id == addition)) {
        items.push(selfLink)
      }
    }

    // Subtractions
    for (const removal of diff.removals) {
      const index = items.findIndex(item => item.id == removal)
      if (index != -1) {
        items.splice(index, 1)
      }
    }
  }
  return document
}

export const getDiffJobs = (config: DatabaseConfig, otherNodePath: AdvancedNodePath, diffs: StringListDiffs) => async (key: string): Promise<FileWriteJob[]> => {
  const nodePath = await geAdvancedNodePath(config, key)
  const document = await getDocument(config, nodePath)
  if (!document)
    return [] // TODO: Create new document once there is a UI to create such situations

  const modifiedDocument = await applyOtherDocumentDiffs(config, nodePath, otherNodePath, diffs, document)
  const content = await stringifyDocument(nodePath, modifiedDocument);
  return [
    {
      filePath: getMarkdownDocumentFilePath(nodePath),
      content,
    }
  ]
}
