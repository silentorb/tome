import { assert } from 'chai'
import * as fse from 'fs-extra'
import {
  getMarkdownDocumentFilePath, getNodeFilePath,
  getNodePath,
  loadDatabasesSync,
  loadNode, NodePath,
  readFile,
  writeDocument,
  writeFile
} from '@tome/database'
import { DocumentNode, IndexNode } from '@tome/data-api'
import * as fs from 'fs'
import * as path from 'path'
import { writeNodeFromRequest } from '../../src/writing'

describe('unit-test', function () {
  this.timeout(15000)

  const books = {
    title: 'Books',
    path: 'books',
    properties: {},
  }

  const source = {
    id: 'story',
    filePath: '/story/data',
    schema: {
      id: 'story',
      title: 'Story',
      structures: {},
    }
  }

  describe('file path resolution', function () {
    it('resolves structured child indexes', async function () {
      const nodePath: NodePath = {
        path: 'story/books',
        source,
        structure: books
      }
      const filePath = getNodeFilePath(nodePath)
      assert.strictEqual(filePath, '/story/data/books')
    })

    it('resolves source indexes', async function () {
      const nodePath: NodePath = {
        path: 'story',
        source,
      }
      const filePath = getNodeFilePath(nodePath)
      assert.strictEqual(filePath, '/story/data')
    })
  })
})
