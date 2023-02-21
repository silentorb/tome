import { assert } from 'chai'
import {
  DatabaseConfig,
  getNodeFilePath,
  getNodePath,
  loadDatabasesSync,
  NodePath,
  expandDocument,
  refineDocument
} from '@tome/database'
import { loadTestResource } from '../utility'
import path from 'path'

const loadExpectedContent = loadTestResource(__dirname, 'expected')
const loadInputContent = loadTestResource(__dirname, 'input')

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

  const config: DatabaseConfig = loadDatabasesSync([path.resolve(__dirname, '../templates/story')])

  describe('file path resolution', function () {
    it('resolves structured child indexes', async function () {
      const nodePath: NodePath = {
        path: 'story/books',
        schema: source.schema,
        schemaFilePath: '/story/data',
        structure: books
      }
      const filePath = getNodeFilePath(nodePath)
      assert.strictEqual(filePath, '/story/data/books')
    })

    it('resolves source indexes', async function () {
      const nodePath: NodePath = {
        path: 'story',
        schemaFilePath: '/story/data',
        schema: source.schema,
      }
      const filePath = getNodeFilePath(nodePath)
      assert.strictEqual(filePath, '/story/data')
    })
  })

  describe('document parsing', function () {
    it('consolidates redundant headings and links', async function () {
      const bobNodePath = getNodePath(config, 'story/characters/bob')
      const redundantBobInput = loadInputContent('bob-redundant.md')
      const rawDocument = await expandDocument(config, bobNodePath, redundantBobInput)
      const refinedDocument = refineDocument(rawDocument)
      const lists = refinedDocument.lists
      assert.lengthOf(lists, 1)
      assert.lengthOf(lists[0].items, 2)
      assert.notEqual(lists[0].items[0].id, lists[0].items[1].id)
    })
  })
})
