import { ListOrder, RecordLink } from '@tome/data-api/dist/src'

export const sortLinks = (order: ListOrder | undefined, items: RecordLink[]): RecordLink[] =>
  order === 'indexed'
    ? items
    : items.sort((a, b) => a.title.localeCompare(b.title))
