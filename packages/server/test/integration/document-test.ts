import { assert } from 'chai'
import * as fse from 'fs-extra'
import {
  getMarkdownDocumentFilePath,
  getNodePath,
  loadDatabasesSync,
  loadNode,
  readFile,
  writeDocument,
  writeFile
} from '@tome/database'
import { DocumentNode, IndexNode } from '@tome/data-api'
import * as fs from 'fs'
import * as path from 'path'
import { writeNodeFromRequest } from '../../src/writing'
import { loadTestResource } from '../utility'

const tempDirectory = './temp'
const storyPath = `${tempDirectory}/story`

// This is a dangerous function and care needs to be taken not to misdirect it.
function deleteTemporaryDirectory() {
  fse.removeSync(tempDirectory)
}

function initializeTempDirectory() {
  deleteTemporaryDirectory()
  fse.ensureDirSync(tempDirectory)
  fse.copySync('test/templates', tempDirectory)
}

const loadExpectedContent = loadTestResource(__dirname, 'expected')

describe('document-test', function () {
  this.timeout(15000)
  let config = loadDatabasesSync([storyPath])

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
        assert.isAtLeast(node.document.lists.length, 1)
      })
    })

    describe('loading indexes', function () {
      it('works', async function () {
        const node = (await loadNode(config)('story/scenes')) as IndexNode
        assert.strictEqual(node.type, 'index')
        assert.lengthOf(node.items, 2)
        assert.strictEqual(node.items[0]?.id, 'story/scenes/introduce-bob')
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
        const nodePath = getNodePath(config, resource)
        const node = await loadNode(config)(resource) as DocumentNode
        const { document } = node
        const list = document.lists.filter(list => list.name == 'Characters')[0]
        list.items.push({
          title: 'alice',
          id: 'story/characters/alice',
        })
        await writeDocument(config)({
          document,
          nodePath
        })

        const content = await readFile(
          getMarkdownDocumentFilePath(getNodePath(config, 'story/characters/alice'))
        )
        const expected = loadExpectedContent('alice01.md')
        assert.strictEqual(content, expected)
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
          getMarkdownDocumentFilePath(getNodePath(config, resource))
        )
        const expected = loadExpectedContent('index01.md')
        assert.strictEqual(content, expected)

        // Check that the new child document is created.
        const childContent = await readFile(
          getMarkdownDocumentFilePath(getNodePath(config, newDocumentPath))
        )
        assert.strictEqual(childContent, loadExpectedContent('start01.md'))
      })
    })

    describe('syncing indexes', function () {
      it('appends missing file references', async function () {
        const resource = 'story/scenes'
        const newFilePath = getMarkdownDocumentFilePath(getNodePath(config, 'story/scenes/something-happens'))
        await writeFile(newFilePath, '# Something happens\n')
        const node = await loadNode(config)(resource) as IndexNode
        const { items } = node
        assert.lengthOf(items, 3)
        assert.strictEqual(items[items.length - 1]?.title, 'Something happens')

        const content = await readFile(getMarkdownDocumentFilePath(getNodePath(config, resource)))
        const expected = loadExpectedContent('index02.md')
        assert.strictEqual(content, expected)
      })
    })
  })
})
