import { DataColumn, RecordLink } from '@tome/data-api'
import { RecordNavigationLink } from './RecordNavigationLink'
import { Trash2 } from 'react-feather'
import styled from 'styled-components'
import { elementSequence, IconButton } from './styling'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, } from '@tanstack/react-table'
import { Row } from '@tanstack/table-core'
import Draggable, { ControlPosition, DraggableEventHandler } from 'react-draggable'
import { useState } from 'react'
import useMeasure from 'react-use-measure'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { DragEndEvent } from '@dnd-kit/core/dist/types'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Cell } from '@tanstack/table-core/src/types'

export type RecordLinksSetter = (items: RecordLink[]) => void

export interface EditListProps {
  setItems: RecordLinksSetter
  options: any[]
  setOptions: (options: any[]) => void
}

interface Props {
  items: RecordLink[]
  columns?: DataColumn[]
  edit?: EditListProps
  isDraggable: boolean
}

interface LinkProps {
  item: RecordLink
}

const LinkItemStyle = styled.span`
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

function DraggableRow(props: { id: string, children: string | JSX.Element | JSX.Element[] }) {
  const { id, children } = props
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <tr key={id} ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </tr>
  )
}

const renderRowContent = (row: Row<any>) => {
  return row.getVisibleCells().map(cell => (
    <LinkTableCell key={cell.id} style={(cell.column.columnDef.meta as any)?.style}>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </LinkTableCell>
  ))
}
//
// const renderRow = (isDraggable: boolean) => (row: Row<any>) => {
//   const tableRow =
//
//
//   return isDraggable
//     ? withDragging(tableRow, row.id)
//     : <tr key={row.id}>{tableRow}</tr>
// }

export const LinkList = (props: Props) => {
  const { items, edit, isDraggable } = props
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
    getRowId: row => row.id,
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  if (items.length == 0)
    return <></>

  const onDragEnd = (event: DragEndEvent) => {

  }
  const onDragStart = () => {
    console.log('wow')
  }

  const tableContent = isDraggable
    ? <SortableContext
      items={items.map(i => i.id)}
      strategy={verticalListSortingStrategy}
    >
      {table.getRowModel().rows.map(row => <DraggableRow id={row.id}>{renderRowContent(row)}</DraggableRow>)}
    </SortableContext>
    : table.getRowModel().rows.map(row => <tr id={row.id}>{renderRowContent(row)}</tr>)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
    >
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
        {tableContent}
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
    </DndContext>
  )
}
