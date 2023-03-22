import * as React from 'react'
import { ChangeEvent, FormEvent, useState } from 'react'
import { idFromTitle } from '../utility/id-from-title'
import styled from 'styled-components'
import { handleKeyboardInput } from '../utility/keyboard'

const TextInput = styled.input`
  width: 400px;
`

export type OnSubmitIdAndTitle = (props: {id: string, title: string}) => void

interface Props {
  onSubmit: OnSubmitIdAndTitle
  onCancel: () => void
  id?: string
  title?: string
  submitText?: string
}

export const IdAndTitleForm = (props: Props) => {
  const { submitText, onCancel } = props
  const [title, setTitle] = useState(props.title || '')
  const [id, setId] = useState(props.id || '')
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    props.onSubmit({id, title})
  }

  const onTextChanged = (set: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    set(event.target.value)
  }

  const idPlaceholder = id
    ? ''
    : idFromTitle(title)

  handleKeyboardInput(e => {
    if (e.key == 'Escape') {
      onCancel()
    }
  })

  return (
    <form onSubmit={onSubmit}>
      <div>
        <label>Name</label><TextInput autoFocus type="text" value={title} onChange={onTextChanged(setTitle)}/>
      </div>
      <div>
        <label>Id</label><TextInput type="text" value={id} onChange={onTextChanged(setId)}
                                    placeholder={idPlaceholder}/>
      </div>
      <input type="submit" value={submitText || 'Submit'}/>
      <input type="button" value="Cancel" onClick={onCancel}/>
    </form>
  )
}
