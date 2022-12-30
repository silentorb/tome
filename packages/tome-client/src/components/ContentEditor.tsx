import React from 'react'
// import { documentState } from '../data'
import styled from 'styled-components'
// import { DataResourceSetter, useLoading } from '../utility'
import { defaultValueCtx, Editor, rootCtx } from '@milkdown/core'
import { nord } from '@milkdown/theme-nord'
import { ReactEditor, useEditor } from '@milkdown/react'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
// import { linkPlugin } from './link-plugin'

// export function newEditor() {
//   const content = document.getElementById('raw-content')?.textContent || ''
//   Editor.make()
//     .use(nord)
//     .use(commonmark)
//     .use(history)
//     .config((context) => {
//       context.set(rootCtx, document.querySelector('#editor'))
//       context.set(defaultValueCtx, content)
//     })
//     .create()
// }

export const ContentEditor = () => {
  let timer = 0
  console.log('Rendering editor')
  const onChange = (value: string) => {
    console.log('changed', '@', document.textContent, '@', value, '@')
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = 0
      console.log('Timer finished')
      if (value !== document.textContent) {
        const newDocument = {
          ...document,
          textContent: value,
        }
        console.log('Updated document')
        // setDocument(right(newDocument))
      }
    }, 1000) as any
  }

  const editor = useEditor(root =>
    Editor.make()
      .config(context => {
        context.set(rootCtx, root)
        context.set(defaultValueCtx, document.textContent)
        context.get(listenerCtx)
          .markdownUpdated((ctx, markdown, prevMarkdown) => {
            console.log('markdown', markdown)
            // output = markdown
            onChange(markdown)
          })
      })
      .use(nord)
      .use(gfm)
      .use(listener)
      // .use(linkPlugin({ navigateTo }))
  )

  return <ReactEditor editor={editor}/>
}
