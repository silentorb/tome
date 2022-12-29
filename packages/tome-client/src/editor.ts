import { defaultValueCtx, Editor, rootCtx } from '@milkdown/core'
import { nord } from '@milkdown/theme-nord'
import { commonmark } from '@milkdown/preset-commonmark'

export function newEditor() {
  const content = document.getElementById('raw-content')?.textContent || ''
  Editor.make()
    .use(nord)
    .use(commonmark)
    .use(history)
    .config((context) => {
      context.set(rootCtx, document.querySelector('#editor'))
      context.set(defaultValueCtx, content)
    })
    .create()
}
