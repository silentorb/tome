import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { ParentNavigation } from './ParentNavigation'
import { MarkdownEditor } from './MarkdownEditor'
import { Form, Formik } from 'formik'
// @ts-ignore
import { ReactEditor } from '@milkdown/react'
// @ts-ignore
import { getMarkdown } from '@milkdown/utils'
import { saveDocument } from '../services'
import { DocumentList, DocumentNode } from '@tome/data-api'
import { LinkListSection } from './LinkListSection'
import { setPageTitle } from '../browser-utility'
import { IdAndTitleForm } from './IdAndTitleForm'
import { IconButton } from './styling'
import { Settings } from 'react-feather'
import { useNavigate } from 'react-router-dom'
import { getAbsoluteResourceUrl } from '../routing'

interface Props {
  node: DocumentNode
}

const getNodeName = (id: string): string => {
  const tokens = id.split('/')
  return tokens[tokens.length - 1]
}
export const useListState = (list: DocumentList) =>
  useState(list)

export const DocumentPage = (props: Props) => {
  const { document, breadcrumbs } = props.node
  const initialValues = {}
  const [title, setTitle] = useState(document.title || '')
  const [id, setId] = useState(props.node.id || '')
  const [renaming, setRenaming] = useState<boolean>(false)
  const markdownEditor = useRef<ReactEditor | undefined>(undefined)
  const listStates = document.lists.map(useListState)
  const linkLists = listStates.map(([list, setList]) =>
    (<LinkListSection key={list.title} list={list} setList={setList}/>)
  )

  const navigate = useNavigate()

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
        lists: listStates.map(l => l[0])
      },
      oldId,
    })
  }

  const onSubmitRenaming = (newNodeName: string, newTitle: string) => {
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

  const renameElement =
    renaming
      ? <IdAndTitleForm id={getNodeName(id)} title={title} onSubmit={onSubmitRenaming} submitText="Rename"/>
      : <IconButton onClick={() => setRenaming(true)}><Settings/></IconButton>

  return (
    <>
      <ParentNavigation breadcrumbs={breadcrumbs}/>
      <h1>{title} {renameElement}</h1>
      <Formik
        initialValues={initialValues}
        onSubmit={(values, actions) => {
          save(id, title)
            .then(() => {
              actions.setSubmitting(false)
            })
        }}
      >
        <Form>
          <MarkdownEditor editorContainer={markdownEditor} id={id} content={document.content}/>
          {linkLists}
          <button type="submit">Submit</button>
        </Form>
      </Formik>
    </>
  )
}
