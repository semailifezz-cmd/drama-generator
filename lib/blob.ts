import { put } from '@vercel/blob'

// Downloads an image/video from a URL and uploads it to Vercel Blob for a permanent URL.
// If BLOB_READ_WRITE_TOKEN is not set, returns the original URL unchanged (graceful fallback).
export async function persistUrl(sourceUrl: string, filename: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return sourceUrl

  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Failed to fetch asset from ${sourceUrl}: ${res.status}`)

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  const buffer = await res.arrayBuffer()

  const { url } = await put(`drama-generator/${filename}`, buffer, {
    access: 'public',
    contentType,
  })

  return url
}
