import { QueryContext } from '../types'
import { DataColumn, RecordLink } from '@tome/data-api'
import { executeGraph } from '../scripting'

export async function expandField(context: QueryContext, column: DataColumn, record: RecordLink): Promise<any> {
  const { getDocument } = context
  const document = await getDocument(record.id)
  if (!document)
    return 0

  const initialState = {
    nodeId: record.id,
    getDocument: context.getDocument,
    type: context.nodePath.type,
  }

  return executeGraph(context, column.query, initialState)
}

export async function expandFields(context: QueryContext, items: RecordLink[], columns?: DataColumn[]): Promise<any> {
  if (!columns || columns.length == 0)
    return items

  return Promise.all(items.map(async (record: any) => {
    for (const column of columns) {
      record[column.id] = await expandField(context, column, record)
    }
    return record
  }))
}
