import { toast } from 'react-toastify'
import { createContext, useContext } from 'react'

export enum NotificationType {
  info = 'info',
  error = 'error',
}

export interface NotificationProps {
  message: string
  type: NotificationType
}

export type Notify = (type: NotificationType, message: string) => void

export const standardNotify: Notify = (type, message) =>
  toast(message, { type })

export const NotificationContext = createContext(standardNotify)

export const useNotify = () => useContext(NotificationContext)
