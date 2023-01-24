import { assert } from 'chai'
import * as fse from 'fs-extra'
import {
  DatabaseConfig,
  getMarkdownDocumentFilePath,
  getNodePath,
  loadDatabase, loadDatabaseSync,
  loadNode,
  readFile,
  writeDocument
} from '@tome/database'
import { DocumentNode, IndexNode } from '@tome/data-api'
import * as fs from 'fs'
import * as path from 'path'
import { writeNodeFromRequest } from '../../src/writing'

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

function loadExpectedContent(filename: string) {
  return fs.readFileSync(path.resolve(__dirname, 'expected', filename), 'utf8')
}

describe('document-test', function () {
  this.timeout(15000)
  let config = loadDatabaseSync(storyPath)

  describe('reading', function () {
    before(function () {
      initializeTempDirectory()
    })

    describe('loading documents', function () {
      it('works', async function () {
        const node = await loadNode(config)('story/scenes/introduce-bob')
        assert.isObject(node)
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
        const node = await loadNode(config)(resource) as IndexNode
        const { items } = node
        items.splice(0, 0, {
          title: 'Start',
          id: 'story/scenes/start',
        })
        await writeNodeFromRequest(config)(node)

        const content = await readFile(
          getMarkdownDocumentFilePath(getNodePath(config, resource))
        )
        const expected = loadExpectedContent('index01.md')
        assert.strictEqual(content, expected)
      })
    })
  })
})
