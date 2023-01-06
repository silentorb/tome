import * as React from 'react'
import { ParentNavigation } from './ParentNavigation'
import { MarkdownEditor } from './MarkdownEditor'
import { Form, Formik } from 'formik'
import { useRef, useState } from 'react'
import { ReactEditor, getMarkdown } from '@milkdown/react'
import { getMarkdown } from '@milkdown/utils'
import { saveDocument } from '../services'
import { DocumentList, ExpandedDocument } from '@tome/data-api'
import { LinkList } from './LinkList'

interface Props {
  id: string
  document: ExpandedDocument
}

export const useListState = (list: DocumentList) =>
  useState(list)

export const DocumentPage = (props: Props) => {
  const { id, document } = props
  const initialValues = {}
  const markdownEditor = useRef<ReactEditor | undefined>(undefined)
  const listStates = document.lists.map(useListState)
  const linkLists = listStates.map(([list, setList]) =>
    (<LinkList key={list.name} list={list} setList={setList}/>)
  )

  return (
    <>
      <ParentNavigation/>
      <Formik
        initialValues={initialValues}
        onSubmit={(values, actions) => {
          const context = markdownEditor.current?.ctx
          const markdown = getMarkdown()(context)
          saveDocument({ id, document: { content: markdown, lists: listStates.map(l => l[0]) } })
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
