"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const fse = require("fs-extra");
const database_1 = require("@tome/database");
const fs = require("fs");
const path = require("path");
const tempDirectory = './temp';
const storyPath = `${tempDirectory}/story`;
// This is a dangerous function and care needs to be taken not to misdirect it.
function deleteTemporaryDirectory() {
    fse.removeSync(tempDirectory);
}
function initializeTempDirectory() {
    deleteTemporaryDirectory();
    fse.ensureDirSync(tempDirectory);
    fse.copySync('test/templates', tempDirectory);
}
function loadExpectedContent(filename) {
    return fs.readFileSync(path.resolve(__dirname, 'expected', filename), 'utf8');
}
describe('document-test', function () {
    this.timeout(15000);
    let config = (0, database_1.loadDatabaseSync)(storyPath);
    describe('reading', function () {
        before(function () {
            initializeTempDirectory();
        });
        describe('loading documents', function () {
            it('works', async function () {
                const node = await (0, database_1.loadNode)(config)('story/scenes/introduce-bob');
                chai_1.assert.isObject(node);
            });
        });
        describe('loading indexes', function () {
            it('works', async function () {
                const node = (await (0, database_1.loadNode)(config)('story/scenes'));
                chai_1.assert.strictEqual(node.type, 'index');
                chai_1.assert.lengthOf(node.items, 2);
                chai_1.assert.strictEqual(node.items[0]?.id, 'story/scenes/introduce-bob');
            });
        });
    });
    describe('writing', function () {
        beforeEach(function () {
            initializeTempDirectory();
        });
        describe('saving documents', function () {
            it('updates referenced documents when list links change', async function () {
                const resource = 'story/scenes/introduce-bob';
                const nodePath = (0, database_1.getNodePath)(config, resource);
                const node = await (0, database_1.loadNode)(config)(resource);
                const { document } = node;
                const list = document.lists.filter(list => list.name == 'Characters')[0];
                list.items.push({
                    title: 'alice',
                    id: 'story/characters/alice',
                });
                await (0, database_1.writeDocument)(config)({
                    document,
                    nodePath
                });
                const alice = await (0, database_1.readFile)((0, database_1.getMarkdownDocumentFilePath)((0, database_1.getNodePath)(config, 'story/characters/alice')));
                const expected = loadExpectedContent('alice01.md');
                chai_1.assert.strictEqual(alice, expected);
            });
        });
        describe('saving documents', function () {
            it('updates referenced documents when list links change', async function () {
                const resource = 'story/scenes/introduce-bob';
                const nodePath = (0, database_1.getNodePath)(config, resource);
                const node = await (0, database_1.loadNode)(config)(resource);
                const { document } = node;
                const list = document.lists.filter(list => list.name == 'Characters')[0];
                list.items.push({
                    title: 'alice',
                    id: 'story/characters/alice',
                });
                await (0, database_1.writeDocument)(config)({
                    document,
                    nodePath
                });
                const alice = await (0, database_1.readFile)((0, database_1.getMarkdownDocumentFilePath)((0, database_1.getNodePath)(config, 'story/characters/alice')));
                const expected = loadExpectedContent('index01.md');
                chai_1.assert.strictEqual(alice, expected);
            });
        });
    });
});
