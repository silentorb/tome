import { assert } from 'chai'
import * as fse from 'fs-extra'
import {
  getMarkdownDocumentFilePath,
  getNodePath,
  loadDatabase,
  loadNode,
  readFile,
  writeDocument
} from '@tome/database'
import { DocumentNode } from '@tome/data-api'

const tempDirectory = './temp'
const storyPath = `${tempDirectory}/story`

// This is a dangerous function and care needs to be taken not to misdirect it.
function deleteTemporaryDirectory() {
  fse.removeSync(tempDirectory)
}

describe('document-test', function () {
  this.timeout(15000)
  before(function () {
    deleteTemporaryDirectory()
    fse.ensureDirSync(tempDirectory)
    fse.copySync('test/templates', tempDirectory)
  })

  describe('loading documents', function () {
    it('works', async function () {
      const config = await loadDatabase(storyPath)
      const node = await loadNode(config)('story/scenes/introduce-bob')
      assert.isObject(node)
    })
  })

  describe('saving documents', function () {
    it('updates referenced documents when list links change', async function () {
      const config = await loadDatabase(storyPath)
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

      const alice = await readFile(
        getMarkdownDocumentFilePath(getNodePath(config, 'story/characters/alice'))
      )
      const expected = `# Alice

## Scenes

*   [Introduce Bob](../scenes/introduce-bob.md)
`
      assert.strictEqual(alice, expected)
    })
  })
})
