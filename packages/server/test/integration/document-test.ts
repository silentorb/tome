import { assert } from 'chai'
import * as fse from 'fs-extra'
import {
  fileExists,
  getMarkdownDocumentFilePath,
  getNodePathOrError,
  joinPaths,
  loadDatabasesSync,
  loadNode,
  readFile,
  writeDocument,
  writeFile
} from '@tome/database'
import { DocumentNode, IndexNode } from '@tome/data-api'
import * as path from 'path'
import { deleteNodeFromRequest, writeNodeFromRequest } from '../../src'
import { findDocumentList, loadTestResource } from '../utility'

const tempDirectory = path.resolve(__dirname, '../..', 'temp')
const storyPath = joinPaths(tempDirectory, 'story')
const businessPath = joinPaths(tempDirectory, 'business')

// This is a dangerous function and care needs to be taken not to misdirect it.
function deleteTemporaryDirectory() {
  fse.removeSync(tempDirectory)
}

function initializeTempDirectory() {
  deleteTemporaryDirectory()
  fse.ensureDirSync(tempDirectory)
  fse.copySync(path.resolve(__dirname, '..', 'templates'), tempDirectory)
}

const loadExpectedContent = loadTestResource(__dirname, 'expected')

describe('document-test', function () {
  this.timeout(15000)
  initializeTempDirectory()
  let config = loadDatabasesSync()([storyPath, businessPath])

  async function compareFileContents(actualFile: string, expectedFile: string) {
    const content = await readFile(
      getMarkdownDocumentFilePath(getNodePathOrError(config, actualFile))
    )
    const expected = loadExpectedContent(expectedFile)
    assert.strictEqual(content, expected)
  }

  describe('reading', function () {
    before(function () {
      initializeTempDirectory()
    })

    describe('loading documents', function () {
      it('works', async function () {
        const node = await loadNode(config)('story/scenes/introduce-bob')
        assert.isObject(node)
      })

      it('loads linked lists', async function () {
        const node = (await loadNode(config)('story/characters/alice')) as DocumentNode
        assert.isObject(node)
        assert.isObject(node.document)
        assert.isAtLeast(node.document.lists.length, 1)
      })

      // it('supports union types', async function () {
      //   const node = await loadNode(config)('tome/business/entities/bob') as DocumentNode
      //   assert.isObject(node)
      //   assert.strictEqual(node.document.title, 'Bob')
      // })

    })

    describe('loading indexes', function () {
      it('works', async function () {
        const node = (await loadNode(config)('story/scenes')) as IndexNode
        assert.strictEqual(node.type, 'index')
        assert.lengthOf(node.items, 2)
      })

      it('supports unions', async function () {
        const node = (await loadNode(config)('tome/business/entities')) as IndexNode
        assert.strictEqual(node.type, 'index')
        assert.lengthOf(node.items, 2)
        assert.strictEqual(node.items[0].title, 'Bob')
      })
    })
  })

  describe('writing', function () {
    beforeEach(function () {
      initializeTempDirectory()
    })

    describe('saving documents', function () {
      it('updates referenced documents when list links change', async function () {
        const resource = 'story/scenes/introduce-bob'
        const nodePath = getNodePathOrError(config, resource)
        const node = await loadNode(config)(resource) as DocumentNode
        const { document } = node
        const list = findDocumentList(document, 'Characters')!
        list.items.push({
          title: 'alice',
          id: 'story/characters/alice',
        })
        await writeDocument(config)({
          document,
          nodePath
        })

        const content = await readFile(
          getMarkdownDocumentFilePath(getNodePathOrError(config, 'story/characters/alice'))
        )
        const expected = loadExpectedContent('alice01.md')
        assert.strictEqual(content, expected)
      })

      it('updates referenced documents when union list links change', async function () {
        const resource = 'tome/business/groups/new-group'
        const nodePath = getNodePathOrError(config, resource)
        const node = await loadNode(config)(resource) as DocumentNode
        const { document } = node
        const bob = 'tome/business/individuals/bob'
        const list = findDocumentList(document, 'Entities')!
        list.items.push({
          title: 'Bob',
          id: bob,
        })
        await writeDocument(config)({
          document,
          nodePath
        })

        const content = await readFile(
          getMarkdownDocumentFilePath(getNodePathOrError(config, bob))
        )
        const expected = loadExpectedContent('bob01.md')
        assert.strictEqual(content, expected)
      })

      it('updates referenced documents with loopback properties', async function () {
        const resource = 'tome/business/groups/novel-entities'
        const nodePath = getNodePathOrError(config, resource)
        const node = await loadNode(config)(resource) as DocumentNode
        const { document } = node
        const list = findDocumentList(document, 'Children')!
        const newGroup = 'tome/business/groups/new-group'
        list.items.push({
          title: 'New group',
          id: newGroup,
        })
        await writeDocument(config)({
          document,
          nodePath
        })

        const content = await readFile(
          getMarkdownDocumentFilePath(getNodePathOrError(config, newGroup))
        )
        const expected = loadExpectedContent('new-group01.md')
        assert.strictEqual(content, expected)
      })

      it('replaces single references', async function () {
        const introduceBob = 'story/scenes/introduce-bob'
        const resource = 'story/books/other-book'
        const nodePath = getNodePathOrError(config, resource)
        const node = await loadNode(config)(resource) as DocumentNode
        const { document } = node
        const list = findDocumentList(document, 'Scenes')!
        list.items.push({
          title: 'Introduce Bob',
          id: introduceBob,
        })
        await writeDocument(config)({
          document,
          nodePath
        })

        const content = await readFile(
          getMarkdownDocumentFilePath(getNodePathOrError(config, introduceBob))
        )
        const expected = loadExpectedContent('introduce-bob01.md')
        assert.strictEqual(content, expected)
      })

    })

    describe('renaming documents', function () {
      it('works and updates linked documents', async function () {
        const oldId = 'story/characters/bob'
        const newId = 'story/characters/frank'
        const oldNodePath = getNodePathOrError(config, oldId)
        const node = await loadNode(config)(oldId) as DocumentNode
        const { document } = node
        document.title = 'Frank'
        const newNodePath = getNodePathOrError(config, newId)
        await writeDocument(config)({
          document,
          nodePath: newNodePath,
          oldNodePath,
        })

        // Assertions
        const oldFileExists = await fileExists(getMarkdownDocumentFilePath(oldNodePath))
        assert.isFalse(oldFileExists)
        await compareFileContents(newId, 'frank01.md')
        await compareFileContents('story/scenes/introduce-bob', 'introduce-bob02.md')
      })

    })

    describe('deleting documents', function () {
      it('works and updates linked documents', async function () {
        const id = 'story/characters/bob'
        const nodePath = getNodePathOrError(config, id)
        const filePath = getMarkdownDocumentFilePath(nodePath)
        assert.isTrue(await fileExists(filePath))
        await deleteNodeFromRequest(config)({ id })
        assert.isFalse(await fileExists(filePath))
        await compareFileContents('story/scenes/introduce-bob', 'introduce-bob03.md')
        await compareFileContents('story/characters', 'characters/index01.md')
      })
    })

    describe('saving indexes', function () {
      it('works', async function () {
        const resource = 'story/scenes'
        const newDocumentPath = 'story/scenes/start'
        const node = await loadNode(config)(resource) as IndexNode
        const { items } = node
        items.splice(0, 0, {
          title: 'Start',
          id: newDocumentPath,
        })
        await writeNodeFromRequest(config)(node)

        const content = await readFile(
          getMarkdownDocumentFilePath(getNodePathOrError(config, resource))
        )
        const expected = loadExpectedContent('index01.md')
        assert.strictEqual(content, expected)

        // Check that the new child document is created.
        const childContent = await readFile(
          getMarkdownDocumentFilePath(getNodePathOrError(config, newDocumentPath))
        )
        assert.strictEqual(childContent, loadExpectedContent('start01.md'))
      })
    })

    describe('syncing indexes', function () {
      it('appends missing file references', async function () {
        const resource = 'story/scenes'
        const newFilePath = getMarkdownDocumentFilePath(getNodePathOrError(config, 'story/scenes/something-happens'))
        await writeFile(newFilePath, '# Something happens\n')
        const node = await loadNode(config)(resource) as IndexNode
        const { items } = node
        assert.lengthOf(items, 3)
        assert.strictEqual(items[items.length - 1]?.title, 'Something happens')

        const content = await readFile(getMarkdownDocumentFilePath(getNodePathOrError(config, resource)))
        const expected = loadExpectedContent('index02.md')
        assert.strictEqual(content, expected)
      })
    })
  })
})
