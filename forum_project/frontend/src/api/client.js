// 统一的 API 请求封装：携带凭据（Cookie Session）、统一错误处理
const BASE = '/api'

async function request(method, path, body, isForm = false) {
  const opts = {
    method,
    credentials: 'include',
    headers: {},
  }
  if (body !== undefined) {
    if (isForm) {
      opts.body = body // FormData
    } else {
      opts.headers['Content-Type'] = 'application/json'
      opts.body = JSON.stringify(body)
    }
  }
  let res
  try {
    res = await fetch(BASE + path, opts)
  } catch (e) {
    throw { ok: false, error: '网络错误，请确认后端服务已启动', code: 0 }
  }
  let data = null
  try { data = await res.json() } catch (e) { /* 非 JSON 响应 */ }
  if (!res.ok || !data || data.ok !== true) {
    throw { ok: false, error: (data && data.error) || `请求失败(${res.status})`, code: res.status }
  }
  return data.data
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  del: (p) => request('DELETE', p),
  upload: (p, formData) => request('POST', p, formData, true),
}
