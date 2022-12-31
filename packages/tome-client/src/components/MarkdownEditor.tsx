import React, { MutableRefObject } from 'react'
// import { documentState } from '../data'
import styled from 'styled-components'
// import { DataResourceSetter, useLoading } from '../utility'
import { defaultValueCtx, Editor, rootCtx } from '@milkdown/core'
import { nord } from '@milkdown/theme-nord'
import { ReactEditor, useEditor } from '@milkdown/react'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
// import { linkPlugin } from './link-plugin'

interface Props {
  content: string
  editorContainer: MutableRefObject<Editor>
}

export const MarkdownEditor = (props: Props) => {
  const editor = useEditor(root =>
      Editor.make()
        .config(context => {
          context.set(rootCtx, root)
          context.set(defaultValueCtx, props.content)
          context.get(listenerCtx)
            .markdownUpdated((context, markdown, prevMarkdown) => {
              // console.log('markdown', markdown)
              // output = markdown
              // onChange(markdown)
            })
        })
        .use(nord)
        .use(gfm)
        .use(listener)
    // .use(linkPlugin({ navigateTo }))
  )

  props.editorContainer.current = editor.getInstance()

  return <ReactEditor editor={editor}/>
}
