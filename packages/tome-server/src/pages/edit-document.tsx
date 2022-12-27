import * as React from 'react'
import { ResourcePageProps } from '../types'
import { readFile } from '../file-operations'
import { capitalizeFirstLetter } from '../string-formatting'
import path from 'path'
import { renderElement } from '../rendering'
import { EditDocument } from 'tome-common'

export const renderEditDocument = async (props: ResourcePageProps & { content: string }) => {
  const { content, urlPath } = props

  const element = <EditDocument content={content}/>
  return {
    title: capitalizeFirstLetter(path.basename(urlPath)),
    content: renderElement(element),
  }
}
