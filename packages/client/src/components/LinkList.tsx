import React, { useState } from 'react'
import { DataColumn, RecordLink } from '@tome/data-api'
import { RecordNavigationLink } from './RecordNavigationLink'
import { Trash2 } from 'react-feather'
import styled from 'styled-components'
import { elementSequence, IconButton } from './styling'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, } from '@tanstack/react-table'

export interface EditListProps {
  setItems: (items: RecordLink[]) => void
  options: any[]
  setOptions: (options: any[]) => void
}

interface Props {
  items: RecordLink[]
  columns?: DataColumn[]
  edit?: EditListProps
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

const deleteItems = (items: any[], edit: EditListProps) => (link: RecordLink) => {
  edit.setItems(
    items.filter(item => item.id != link.id)
  )
  edit.setOptions(
    edit.options?.concat(linkToOption(link))
  )
}

export const LinkList = (props: Props) => {
  const { items, edit } = props
  const columnHelper = createColumnHelper<any>()

  const additionalColumns = edit
    ? [
      columnHelper.display({
        id: 'delete',
        header: 'Delete',
        meta: {
          style: { textAlign: 'center' }
        },
        cell: props => <IconButton onClick={() => deleteItems(items, edit)(props.row.original)}><Trash2/></IconButton>
      }),
    ]
    : []

  const columns = [
    columnHelper.display({
      id: 'title',
      header: 'Name',
      cell: props => <LinkItem item={props.row.original}/>
    }),
  ]
    .concat(
      (props.columns || []).map(c =>
        columnHelper.display({
          id: c.id,
          header: c.title,
          cell: props => props.row.original[c.id]
        })
      )
    )
    .concat(additionalColumns)

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (items.length == 0)
    return <></>

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
