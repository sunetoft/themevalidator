export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { saveUploadedFile, ensureUploadDir } from '@/lib/s3'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const reqContentType = request.headers.get('content-type') ?? ''

    // Direct file upload (multipart) — save to local storage and return the URL.
    if (reqContentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'File is required' }, { status: 400 })
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      const { filename } = await saveUploadedFile(
        buffer,
        file.name,
        file.type || 'application/octet-stream'
      )
      return NextResponse.json({
        uploadUrl: '/api/upload/presigned',
        fileUrl: `/uploads/${filename}`,
        fileName: filename,
      })
    }

    // Metadata request — return a local upload URL the client can POST the file to.
    const { fileName, contentType, isPublic } = await request.json()
    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'fileName and contentType required' }, { status: 400 })
    }
    await ensureUploadDir()
    return NextResponse.json({
      uploadUrl: '/api/upload/presigned',
      fileUrl: `/uploads/${fileName}`,
      fileName,
      isPublic: isPublic ?? false,
    })
  } catch (err: any) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Failed to handle upload' }, { status: 500 })
  }
}
