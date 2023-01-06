import { DocumentList, ExpandedDocument } from '@tome/data-api'
import { getRelativePath } from './file-operations'

export async function generateMarkdown(ast: any) {
  const { unified } = await import('unified')
  const remarkStringify = await import('remark-stringify')
  return unified()
    .use(remarkStringify.default)
    .stringify(ast)
}

export function generateLinkListAst(localPath: string, list: DocumentList) {
  return [
    {
      type: 'heading',
      depth: 2,
      children: [
        { type: 'text', value: list.name },
      ]
    },
    {
      type: 'list',
      ordered: false,
      children: list.items.map(item => {
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
  ]
}

export function generateDocumentAppendingAst(localPath: string, document: ExpandedDocument) {
  const children = document.lists.reduce((a, b) =>
      a.concat(generateLinkListAst(localPath, b))
    , [] as any[])

  return {
    type: 'root',
    children,
  }
}
