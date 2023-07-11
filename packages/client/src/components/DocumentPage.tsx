import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { ParentNavigation } from './ParentNavigation'
import { MarkdownEditor } from './MarkdownEditor'
// @ts-ignore
import { ReactEditor } from '@milkdown/react'
// @ts-ignore
import { getMarkdown } from '@milkdown/utils'
import { deleteDocument, saveDocument } from '../services'
import { DocumentList, DocumentNode } from '@tome/data-api'
import { getParentUrl, setPageTitle } from '../utility/browser-utility'
import { IdAndTitleForm, OnSubmitIdAndTitle } from './IdAndTitleForm'
import { IconButton } from './styling'
import { Settings, Trash2 } from 'react-feather'
import { useNavigate } from 'react-router-dom'
import { getAbsoluteResourceUrl } from '../routing'
import { NotificationType, useNotify } from '../utility/notifications'
import styled from 'styled-components'
import { PropertiesSection } from './PropertiesSection'

interface Props {
  node: DocumentNode
}

const SubmitButton = styled.button`
  margin: 20px;
`

const getNodeName = (id: string): string => {
  const tokens = id.split('/')
  return tokens[tokens.length - 1]
}
export const useListState = (list: DocumentList) =>
  useState(list)

export const DocumentPage = (props: Props) => {
  const { node } = props
  const { document, breadcrumbs } = node
  const initialValues = {}
  const [title, setTitle] = useState(document.title || '')
  const [id, setId] = useState(node.id || '')
  const [renaming, setRenaming] = useState<boolean>(false)
  const markdownEditor = useRef<ReactEditor | undefined>(undefined)
  const listStates = document.lists.map(useListState)
  const navigate = useNavigate()
  const notify = useNotify()

  useEffect(() => {
    setPageTitle(document.title)
  }, [])

  const save = (id: string, title: string, oldId?: string) => {
    const context = markdownEditor.current?.ctx
    const markdown = getMarkdown()(context)
    return saveDocument({
      id,
      type: 'document',
      document: {
        title, // Not actually used right now--the server will extract the title from the content
        type: document.type,
        content: markdown,
        lists: listStates.map(l => l[0]),
        fields: document.fields,
      },
      oldId,
    })
      .then(() => notify(NotificationType.info, `Saved ${title}`))
      .catch(() => notify(NotificationType.error, `Error saving ${title}`))
  }

  const onSubmitRenaming: OnSubmitIdAndTitle = renameProps => {
    const newNodeName = renameProps.id
    const newTitle = renameProps.title
    const tokens = id.split('/')
    const newId = tokens.slice(0, tokens.length - 1).concat([newNodeName]).join('/')

    setId(newId)
    setTitle(newTitle)
    setRenaming(false)

    save(newId, newTitle, id)
      .then(() => {
        if (id != newId) {
          navigate(getAbsoluteResourceUrl(newId))
        }
      })
  }

  const onDelete = () => {
    if (confirm(`Are you sure you want to delete ${title}?`)) {
      deleteDocument({ id })
        .then(() => {
          navigate(getParentUrl())
        })
    }
  }

  const renameButton =
    renaming
      ? undefined
      : <IconButton onClick={() => setRenaming(true)}><Settings/></IconButton>

  const renameForm = renaming
    ? <IdAndTitleForm id={getNodeName(id)} title={title} onSubmit={onSubmitRenaming} submitText="Rename"
                      onCancel={() => setRenaming(false)}/>
    : undefined

  return (
    <>
      <ParentNavigation breadcrumbs={breadcrumbs}/>
      <h1>{title} {renameButton} <IconButton onClick={onDelete}><Trash2/></IconButton></h1>
      {renameForm}
      <MarkdownEditor editorContainer={markdownEditor} id={id} content={document.content}/>
      <PropertiesSection document={document} listStates={listStates} type={node.dataType}/>
      <SubmitButton onClick={() => save(id, title)}>Save Changes</SubmitButton>
    </>
  )
}
