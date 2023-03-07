import React, { useState } from 'react'
import { DocumentList, RecordLink } from '@tome/data-api'
import { RecordNavigationLink } from './RecordNavigationLink'
import { Trash2 } from 'react-feather'
import styled from 'styled-components'
import { elementSequence, IconButton } from './styling'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'

interface Props {
  items: RecordLink[]
  setItems: (items: RecordLink[]) => void
}

interface LinkProps {
  item: RecordLink
}

const LinkItemStyle = styled.li`
  ${elementSequence}
`

const LinkTable = styled.table`
  border: 1px solid;

  tr:nth-child(even) {
    background-color: #f6f6f6;
  }

  border-collapse: collapse;
`

const LinkTableHeader = styled.th`
  border-bottom: 1px solid;
  padding: 10px;
`

const LinkTableCell = styled.td`
  padding: 5px;
`

const LinkItem = ({ item }: LinkProps) => {
  return (
    <LinkItemStyle>
      <RecordNavigationLink item={item}/>
    </LinkItemStyle>
  )
}

const linkToOption = (link: RecordLink) => (
  {
    value: link.id,
    label: link.title
  }
)

const setListItems = (list: DocumentList, items: RecordLink[]) => ({
  ...list,
  items,
})

export const LinkList = (props: Props) => {
  const { items, setItems } = props
  const [options, setOptions] = useState<any[] | undefined>(undefined)

  const onDelete = (link: RecordLink) => {
    setItems(
      items.filter(item => item.id != link.id)
    )
    setOptions(
      options?.concat(linkToOption(link))
    )
  }

  // const rows = items.map(item => <LinkItem onDelete={onDelete} item={item} key={item.id}/>)

  const columnHelper = createColumnHelper<RecordLink>()

  const columns = [
    columnHelper.display({
      id: 'title',
      header: 'Name',
      cell: props => <LinkItem item={props.row.original} />
    }),
    columnHelper.display({
      id: 'delete',
      header: 'Delete',
      meta: {
        style: { textAlign: 'center' }
      },
      cell: props => <IconButton onClick={() => onDelete(props.row.original)}><Trash2/></IconButton>
    }),

    // columnHelper.accessor('title', {
    //   cell: info => info.getValue(),
    //   footer: info => info.column.id,
    // }),
  ]

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <LinkTable>
      <thead>
      {table.getHeaderGroups().map(headerGroup => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map(header => (
            <LinkTableHeader key={header.id}>
              {header.isPlaceholder
                ? null
                : flexRender(
                  header.column.columnDef.header,
                  header.getContext()
                )}
            </LinkTableHeader>
          ))}
        </tr>
      ))}
      </thead>
      <tbody>
      {table.getRowModel().rows.map(row => (
        <tr key={row.id}>
          {row.getVisibleCells().map(cell => (
            <LinkTableCell key={cell.id} style={(cell.column.columnDef.meta as any)?.style}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </LinkTableCell>
          ))}
        </tr>
      ))}
      </tbody>
      <tfoot>
      {table.getFooterGroups().map(footerGroup => (
        <tr key={footerGroup.id}>
          {footerGroup.headers.map(header => (
            <th key={header.id}>
              {header.isPlaceholder
                ? null
                : flexRender(
                  header.column.columnDef.footer,
                  header.getContext()
                )}
            </th>
          ))}
        </tr>
      ))}
      </tfoot>
    </LinkTable>
    // <ul>
    //   {rows}
    // </ul>
  )
}
