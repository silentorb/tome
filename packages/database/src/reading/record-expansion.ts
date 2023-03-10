import { QueryContext } from '../types'
import { DataColumn, RecordLink } from '@tome/data-api'
import { getListItems } from '../documents'
import { executeGraph } from '../scripting'
import { getNodePath } from '../pathing'

export async function expandField(context: QueryContext, column: DataColumn, record: RecordLink): Promise<any> {
  const { getDocument } = context
  const document = await getDocument(record.id)
  if (!document)
    return 0

  const newContext = {
    ...context,
    nodePath: getNodePath(context.config, record.id)!,
  }
  const initialState = {
    nodeId: record.id,
  }
  return executeGraph(newContext, context.config.library, column.query, initialState)
  // const { type } = nodePath
  // const property = type ? type.properties['elements'] : undefined
  // const items = property ? (getListItems(document.lists, property) || []) : []
  // return items.length
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
