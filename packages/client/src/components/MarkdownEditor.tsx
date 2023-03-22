import React, { MutableRefObject } from 'react'
// @ts-ignore
import { defaultValueCtx, Editor, rootCtx } from '@milkdown/core'
// @ts-ignore
import { nord } from '@milkdown/theme-nord'
// @ts-ignore
import { ReactEditor, useEditor } from '@milkdown/react'
// @ts-ignore
import { gfm } from '@milkdown/preset-gfm'
// @ts-ignore
import { listener, listenerCtx } from '@milkdown/plugin-listener'

interface Props {
  id: string
  content: string
  editorContainer: MutableRefObject<Editor>
}

export const MarkdownEditor = (props: Props) => {
  const {id, content} = props
  const editor = useEditor((root: any) =>
      Editor.make()
        .config((context: any) => {
          context.set(rootCtx, root)
          context.set(defaultValueCtx, content)
          context.get(listenerCtx)
            .markdownUpdated((context: any, markdown: any, prevMarkdown: any) => {
              // console.log('markdown', markdown)
              // output = markdown
              // onChange(markdown)
            })
        })
        .use(nord)
        .use(gfm)
        .use(listener),
    // .use(linkPlugin({ navigateTo })),
    [id, content]
  )

  props.editorContainer.current = editor.getInstance()

  return <ReactEditor editor={editor}/>
}

