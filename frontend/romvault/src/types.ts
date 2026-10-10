export type User = {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
}
export type Game = {
  id: string
  title: string
  platform: string
  original_name: string
  extension: string
  size: number
  checksum: string
  has_cover: boolean
  cover_version: string
  favorite: boolean
  created_at: string
}
export type Extension = {
  extension: string
  platform: string
  enabled: boolean
}
export type Share = {
  id: string
  label: string
  expires_at: string
  created_at: string
}
export type Config = { registration_enabled: boolean; max_upload_bytes: number }
