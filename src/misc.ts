export const mergeHeaders = (requestOrUrl: string | Request, requestInit?: Request | RequestInit) => {
  let headers = new Headers()
  if (requestOrUrl instanceof Request && requestOrUrl.headers) headers = new Headers(requestOrUrl.headers)

  let initHeaders = new Headers()
  if (requestInit && requestInit.headers) initHeaders = new Headers(requestInit.headers)

  initHeaders.forEach((value, key) => headers.set(key, value))
  return headers
}

export const nullOrUndefined = (value) => {
  return value === null || typeof value === 'undefined'
}
