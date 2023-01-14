import * as React from 'react'
import { ParentNavigation } from './ParentNavigation'
import { RecordLink } from '@tome/data-api'
import { RecordNavigationLink } from './RecordNavigationLink'
import { PlusCircle, Trash2 } from 'react-feather'
import { IconButton } from './styling'
import { ChangeEvent, FormEvent, useState } from 'react'
import { getIdFromRequest, saveDocument } from '../services'

interface Props {
  items: RecordLink[]
  includeParentNavigation: boolean
}

interface CreationFormProps {
  onSubmit: (name: string) => void
}

export const CreationForm = (props: CreationFormProps) => {
  const [name, setName] = useState('')
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    props.onSubmit(name)
  }

  const onNameChanged = (event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value)
  }
  return (
    <form onSubmit={onSubmit}>
      <input autoFocus type="text" value={name} onChange={onNameChanged}/>
    </form>
  )
}

export const IndexPage = (props: Props) => {
  const [creating, setCreating] = useState<boolean>(false)
  const [items, setItems] = useState(props.items)

  const links = items.map(item => (
    <RecordNavigationLink key={item.id} item={item}/>
  ))

  const parentNavigation = props.includeParentNavigation
    ? <ParentNavigation/> : undefined

  const onStartCreation = () => {
    setCreating(true)
  }

  const onSetCreationName = (title: string) => {
    const nodeName = title.toLowerCase().replace(/ /g, '-')
    const id = `${getIdFromRequest(window.location.href)}/${nodeName}`

    saveDocument({
      id,
      document: {
        title, // Not actually used right now--the server will extract the title from the content
        content: `# ${nodeName}\n`,
        lists: [],
      }
    })
      .then(() => {
        setItems(items.concat([
          {
            title,
            id,
          }
        ]))
      })

    setCreating(false)
  }

  const creationElement =
    creating
      ? <CreationForm onSubmit={onSetCreationName}/>
      : <IconButton onClick={() => onStartCreation()}><PlusCircle/></IconButton>

  return (
    <>
      {parentNavigation}
      <div>
        {creationElement}
        {links}
      </div>
    </>
  )
}
