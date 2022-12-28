import React from 'react'
import ReactDOM from 'react-dom'

function main() {
  const editorContainer = document.getElementById('editor')
  if (editorContainer) {
    editorContainer.appendChild(document.createTextNode("Greetings"))
    // const root = ReactDOM.createRoot(editorContainer)
    // const element = <h1>Hello, world</h1>
    // root.render(element)
  }
}

main()
