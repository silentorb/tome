import { AdvancedNodePath, DatabaseConfig, FileWriteJob, ListDiff, NodePath } from './types'
import { DocumentList, ExpandedDocument, Property, RecordLink } from '@tome/data-api'
import { unique } from './functional'
import { generateDocumentAppendingAst, stringifyMarkdown } from './markdown-generation'
import path from 'path'
import { deepClonePlainData } from './cloning'
import { getAdvancedNodePath, getMarkdownDocumentFilePath, getNodePath } from './pathing'
import { loadExpandedDocument } from './reading'

export function subtractArray<T>(a: T[], b: T[]) {
  return a.filter(item => b.indexOf(item) == -1)
}

export const diffStringSets = (previous: string[], next: string[]): ListDiff<string> => {
  return {
    removals: subtractArray(previous, next),
    additions: subtractArray(next, previous),
  }
}

export type StringListDiff = ListDiff<string>
export type StringListDiffs = [string, ListDiff<string>][]

export const diffListLinks = (previous: DocumentList[], next: DocumentList[]): StringListDiffs => {
  const findListItems = (lists: DocumentList[], key: string) =>
    lists.filter((list => list.id == key))[0]?.items?.map(i => i.id) || []

  const groups = unique(
    previous
      .map(list => list.id)
      .concat(next.map(list => list.id))
  )
    .map(key => ({
      key,
      previous: findListItems(previous, key),
      next: findListItems(next, key),
    }))

  return groups
    .map(({ key, previous, next }) => {
      return [key, diffStringSets(previous, next)]
    })
}

export const getAllDiffKeys = (diffs: StringListDiffs) =>
  diffs.reduce((a, [_, b]) => a.concat(b.additions, b.removals), [] as string[])
