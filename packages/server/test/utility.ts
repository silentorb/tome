import fs from 'fs'
import path from 'path'
import { DocumentList, ExpandedDocument } from '@tome/data-api/dist/src'

export const loadTestResource = (testScriptDir: string, subFolder: string) => (filename: string) =>
  fs.readFileSync(path.resolve(testScriptDir, subFolder, filename), 'utf8')

export const findDocumentList = (document: ExpandedDocument, listName: string): DocumentList | undefined =>
  document.lists.filter(list => list.title == listName)[0]
