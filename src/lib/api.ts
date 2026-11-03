import type { Annotation, MapSummary, MapVersion, Project } from './types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json') ? await response.json() : null
  if (!response.ok) {
    const message = body && typeof body.error === 'string' ? body.error : `Erreur HTTP ${response.status}`
    throw new Error(message)
  }
  return body as T
}

export async function getMaps(): Promise<MapSummary[]> {
  const result = await request<{ maps: MapSummary[] }>('/api/maps')
  return result.maps
}

export async function getProject(mapId: string): Promise<Project> {
  return request<Project>(`/api/maps/${encodeURIComponent(mapId)}/project`)
}

export async function getMapVersions(mapId: string): Promise<MapVersion[]> {
  const result = await request<{ versions: MapVersion[] }>(`/api/maps/${encodeURIComponent(mapId)}/versions`)
  return result.versions
}

export async function saveProject(mapId: string, annotations: Annotation[]): Promise<Project> {
  const result = await request<{ project: Project }>(`/api/maps/${encodeURIComponent(mapId)}/project`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotations }),
  })
  return result.project
}

export async function importWmmProjects(
  files: File[],
): Promise<Array<{ file: string; map: string; annotations: number }>> {
  const body = new FormData()
  for (const file of files) body.append('projects', file)
  const result = await request<{ imported: Array<{ file: string; map: string; annotations: number }> }>(
    '/api/projects/import',
    { method: 'POST', body },
  )
  return result.imported
}
