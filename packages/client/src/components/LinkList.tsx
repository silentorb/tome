import { DataColumn, RecordLink } from '@tome/data-api'
import { RecordLinkIcon, RecordNavigationLink, RecordNavigationLinkWithIcon } from './RecordNavigationLink'
import { Trash2 } from 'react-feather'
import styled from 'styled-components'
import { elementSequence, IconButton } from './styling'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, } from '@tanstack/react-table'
import { Row } from '@tanstack/table-core'
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

const VerticalDraggable = styled.span`
  cursor: ns-resize;
`

const DraggableRowStyle = styled.tr`
  cursor: ns-resize;
`

const LinkItem = ({ item }: LinkProps) => {
  return (
    <LinkItemStyle>
      <RecordNavigationLinkWithIcon item={item}/>
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

const renderRowContent = (row: Row<any>, additionalContext: any = {}) => {
  return row.getVisibleCells().map(cell => (
    <LinkTableCell key={cell.id} style={(cell.column.columnDef.meta as any)?.style}>
      {flexRender(cell.column.columnDef.cell, { ...cell.getContext(), ...additionalContext })}
    </LinkTableCell>
  ))
}

function DraggableRow(props: { row: Row<any> }) {
  const { row } = props
  const { id } = row
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
    <tr key={id} ref={setNodeRef} style={style}>
      {renderRowContent(row, { draggable: { attributes, listeners } })}
    </tr>
  // return (
  //   <DraggableRowStyle key={id} ref={setNodeRef} style={style} {...attributes} {...listeners}>
  //     {renderRowContent(row)}
  //   </DraggableRowStyle>
  )
}

export const LinkList = (props: Props) => {
  const { items, edit, } = props
  const isDraggable = props.isDraggable && edit
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
      id: 'icon',
      cell: (props: any) => isDraggable
        ? <VerticalDraggable {...props.draggable?.attributes} {...props.draggable?.listeners}>
          <RecordLinkIcon item={props.row.original}/>
        </VerticalDraggable>
        : <RecordLinkIcon item={props.row.original}/>
    }),
    columnHelper.display({
      id: 'title',
      header: 'Name',
      cell: props => <RecordNavigationLink item={props.row.original}/>
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
    if (!edit)
      return

    const active = event.active?.id
    const over = event.over?.id
    if (active && over && active != over) {
      const activeIndex = items.findIndex(i => i.id == active)
      const overIndex = items.findIndex(i => i.id == over)
      if (activeIndex > -1 && overIndex > -1) {
        edit.setItems(arrayMove(items, activeIndex, overIndex))
      }
    }
    console.log(event)
  }

  const tableContent = isDraggable
    ? <SortableContext
      items={items.map(i => i.id)}
      strategy={verticalListSortingStrategy}
    >
      {table.getRowModel().rows.map(row => <DraggableRow row={row}/>)}
    </SortableContext>
    : table.getRowModel().rows.map(row => <tr id={row.id}>{renderRowContent(row)}</tr>)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
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
