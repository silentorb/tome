import * as React from 'react'
import { ParentNavigation } from './misc'
import { ExpandedDocument } from 'tome-common'
import { MarkdownEditor } from './MarkdownEditor'
import { Form, Formik } from 'formik'
import { useRef } from 'react'
import { ReactEditor, getMarkdown } from '@milkdown/react'
import { getMarkdown } from '@milkdown/utils'
import { saveDocument } from '../services'

interface Props {
  document: ExpandedDocument
}

export const DocumentPage = (props: Props) => {
  const { document } = props
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
          saveDocument({ id: document.id, content: markdown })
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
