import { ChangeEvent, FormEvent, useState } from 'react'
import { idFromTitle } from '../id-from-title'
import * as React from 'react'
import styled from 'styled-components'

const TextInput = styled.input`
  width: 400px;
`

interface Props {
  onSubmit: (id: string, title: string) => void
  id?: string
  title?: string
  submitText?: string
}

export const IdAndTitleForm = (props: Props) => {
  const { submitText } = props
  const [title, setTitle] = useState(props.title || '')
  const [id, setId] = useState(props.id || '')
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    props.onSubmit(id, title)
  }

  const onTextChanged = (set: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    set(event.target.value)
  }

  const idPlaceholder = id
    ? ''
    : idFromTitle(title)

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
    </form>
  )
}
