import { DocumentList, ExpandedDocument, RecordLink } from '@tome/data-api'
import { getRelativeMarkdownPath, getRelativePath } from './file-operations'

export async function stringifyMarkdown(ast: any): Promise<string> {
  const { unified } = await import('unified')
  const remarkStringify = await import('remark-stringify')
  const raw = unified()
    // @ts-ignore
    .use(remarkStringify.default, {
      listItemIndent: '1',
    })
    .stringify(ast)

  // mdast-util-to-markdown is ignoring no spread on lists.
  // This regex uses lookbehind so it only works with V8 and Edge JavaScript.
  // TODO: Find a more universal and less-hacky solution to remark-stringify
  return raw
    .replace(/(?<=\*[^\r\n]+)\r?\n\r?\n\* /g, '\n* ')
}

export function generateLinkListAst(localPath: string, items: RecordLink[]) {
  return {
    type: 'list',
    ordered: false,
    children: items.map(item => {
      const relativePath = getRelativeMarkdownPath(localPath, item.id)
      return {
        type: 'listItem',
        spread: false,
        children: [{
          type: 'paragraph',
          children: [{
            type: 'link',
            url: `${relativePath}.md`,
            children: [{ type: 'text', value: item.title }]
          }]
        }]
      }
    })
  }
}

export function generateLinkListAstWithHeader(localPath: string, list: DocumentList) {
  return [
    {
      type: 'heading',
      depth: 2,
      ordered: list.order === 'indexed',
      children: [
        { type: 'text', value: list.name },
      ]
    },
    generateIndexListAst(localPath, list.items),
  ]
}

export function generateDocumentAppendingAst(localPath: string, document: ExpandedDocument) {
  const children = document.lists.reduce((a, b) =>
      a.concat(generateLinkListAstWithHeader(localPath, b))
    , [] as any[])

  return {
    type: 'root',
    children,
  }
}

export function generateIndexListAst(localPath: string, items: RecordLink[]) {
  return {
    type: 'root',
    children: [
      generateLinkListAst(localPath, items)
    ],
  }
}
