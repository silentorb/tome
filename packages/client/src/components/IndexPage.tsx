import * as React from 'react'
import { useEffect, useState } from 'react'
import { ParentNavigation } from './ParentNavigation'
import { IndexNode } from '@tome/data-api'
import { PlusCircle } from 'react-feather'
import { IconButton } from './styling'
import { getIdFromRequest, saveDocument } from '../services'
import { capitalizeFirstLetter } from '../utility/string-formatting'
import { idFromTitle } from '../utility/id-from-title'
import { sortLinks } from '@tome/data-processing'
import { LinkList } from './LinkList'
import { setPageTitle } from '../utility/browser-utility'
import { IdAndTitleForm, OnSubmitIdAndTitle } from './IdAndTitleForm'
import { NotificationType, useNotify } from '../utility/notifications'
import { handleKeyboardInput } from '../utility/keyboard'
import { documentCreation } from './DocumentCreation'

interface Props {
  node: IndexNode
}

const getTitle = (node: IndexNode): string => {
  if (node.title)
    return node.title

  const structureName = node.dataType?.id
  return node.dataType?.title || (
    structureName
      ? capitalizeFirstLetter(structureName)
      : 'Items'
  )
}

export const IndexPage = (props: Props) => {
  const { node } = props

  const onSetCreationName: OnSubmitIdAndTitle = submitProps => {
    const { title } = submitProps
    if (title) {
      const nodeName = submitProps.id || idFromTitle(title)
      const id = `${getIdFromRequest(window.location.href)}/${nodeName}`
      const newItems = items.concat([
        {
          title,
          id,
        }
      ])

      setItems(sortLinks([], newItems))
    }
  }

  const [creating, setCreating, creationButton, creationForm] = documentCreation({ onSubmit: onSetCreationName })
  const [items, setItems] = useState(node.items)
  const [initialized, setInitialized] = useState(false)
  const title = getTitle(node)
  const notify = useNotify()

  useEffect(() => {
    setPageTitle(title)
  }, [])

  const parentNavigation = node.id !== '' || (node.breadcrumbs?.length || 0 > 0)
    ? <ParentNavigation breadcrumbs={node.breadcrumbs}/> : undefined

  useEffect(() => {
    if (!initialized) {
      setInitialized(true)
    }
  }, [initialized])

  useEffect(() => {
    // Only run when changes happen after initialization
    if (initialized) {
      saveDocument({
        id: node.id,
        type: 'index',
        items: items,
      })
        .then(() => notify(NotificationType.info, `Saved changes`))
        .catch(() => notify(NotificationType.error, `Error saving changes`))
    }
  }, [items])

  handleKeyboardInput(e => {
    if (e.key === 'n' && e.altKey) {
      e.preventDefault()
      if (!creating) {
        setCreating(true)
      }
    }
  })

  return (
    <>
      <div>{parentNavigation}</div>
      <h1>{title}</h1>
      <div>
        {creationButton}{creationForm}
        <LinkList items={items} columns={node.columns}/>
      </div>
    </>
  )
}
