import { newEditor } from './editor.js'

function main() {
  const editorContainer = document.getElementById('editor')
  if (editorContainer) {
    newEditor()
    // editorContainer.appendChild(document.createTextNode("Greetings"))
    // const root = ReactDOM.createRoot(editorContainer)
    // const element = <h1>Hello, world</h1>
    // root.render(element)
  }
}

main()
