import { ExpandedDocument } from '@tome/data-api'


export async function expandDocument(content: string): Promise<ExpandedDocument> {
  const { remark } = await import('remark')
  const data = await remark()
    .process(content)

  return {
    content,
    lists: [],
  }
}
