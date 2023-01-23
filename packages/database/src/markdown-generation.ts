import { DocumentList, ExpandedDocument, RecordLink } from '@tome/data-api'
import { getRelativePath } from './file-operations'

export async function stringifyMarkdown(ast: any) {
  const { unified } = await import('unified')
  const remarkStringify = await import('remark-stringify')
  return unified()
    .use(remarkStringify.default)
    .stringify(ast)
}

export function generateLinkListAst(localPath: string, items: RecordLink[]) {
  return {
    type: 'list',
    ordered: false,
    children: items.map(item => {
      const relativePath = getRelativePath(localPath, item.id)
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
