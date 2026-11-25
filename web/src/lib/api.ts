export class APIError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function getAuthToken(): string {
  return localStorage.getItem('subui_jwt') || ''
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  const tok = getAuthToken()
  if (tok && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${tok}`)
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  })

  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text }
  }

  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register' && path !== '/api/setup') {
      localStorage.removeItem('subui_jwt')
    }
    throw new APIError((data.error as string) || `请求失败 (${res.status})`, res.status)
  }
  return data as T
}
