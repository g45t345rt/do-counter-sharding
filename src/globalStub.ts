import { Counters, WriteInfo } from './index'
import { mergeHeaders } from './misc'

export class CounterGlobalStub {
  fetch: (requestOrUrl: string | Request, requestInit?: Request | RequestInit) => Promise<Response>

  constructor(namespace: DurableObjectNamespace) {
    const id = namespace.idFromName(`global`)
    const stub = namespace.get(id)

    this.fetch = function (requestOrUrl: string | Request, requestInit?: Request | RequestInit) {
      let headers = mergeHeaders(requestOrUrl, requestInit)

      // Pass global as shardName to dispatch fetch to global handlers
      headers.set(`shardName`, stub.name)

      return stub.fetch(requestOrUrl, {
        ...requestInit,
        headers
      })
    }
  }

  async counters() {
    const res = await this.fetch(`/counters`)
    if (!res.ok) throw res
    return await res.json<Counters>()
  }

  async write(writeInfo: WriteInfo) {
    return await this.fetch(`/write`, {
      method: 'POST',
      body: JSON.stringify(writeInfo)
    })
  }

  async reset(counterName: string) {
    return await this.fetch(`/reset/${counterName}`, {
      method: 'POST'
    })
  }

  async shards() {
    const res = await this.fetch(`/shards`)
    if (!res.ok) throw res
    return await res.json<number[]>()
  }
}
