import * as React from 'react'
import { ParentNavigation } from './ParentNavigation'
import { MarkdownEditor } from './MarkdownEditor'
import { Form, Formik } from 'formik'
import { useRef } from 'react'
import { ReactEditor, getMarkdown } from '@milkdown/react'
import { getMarkdown } from '@milkdown/utils'
import { saveDocument } from '../services'
import { ExpandedDocument } from '@tome/data-api'

interface Props {
  id: string
  document: ExpandedDocument
}

export const DocumentPage = (props: Props) => {
  const { id, document } = props
  const initialValues = {}
  const markdownEditor = useRef<ReactEditor | undefined>(undefined)

  return (
    <>
      <ParentNavigation/>
      <Formik
        initialValues={initialValues}
        onSubmit={(values, actions) => {
          const context = markdownEditor.current?.ctx
          const markdown = getMarkdown()(context)
          saveDocument({ id, document: { content: markdown } })
            .then(() => {
              actions.setSubmitting(false)
            })
        }}
      >
        <Form>
          <MarkdownEditor editorContainer={markdownEditor} content={document.content}/>
          <button type="submit">Submit</button>
        </Form>
      </Formik>
    </>
  )
}
