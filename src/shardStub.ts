import { Counters } from './index'
import { mergeHeaders } from './misc'

interface CounterShardStubArgs {
  namespace: DurableObjectNamespace
  shardCount: number
  shardNumber?: number
}

export class CounterShardStub {
  fetch: (requestOrUrl: string | Request, requestInit?: Request | RequestInit) => Promise<Response>

  constructor(args: CounterShardStubArgs) {
    const { namespace, shardCount } = args

    let shardNumber = args.shardNumber
    if (shardNumber === null || shardNumber === undefined) {
      shardNumber = Math.floor(Math.random() * shardCount)
    }

    const id = namespace.idFromName(`shard${shardNumber}`)
    const stub = namespace.get(id)
    this.fetch = function (requestOrUrl: string | Request, requestInit?: Request | RequestInit) {
      let headers = mergeHeaders(requestOrUrl, requestInit)

      // Pass shardName in headers to know where the writeToGlobal comes from
      headers.set(`shardName`, stub.name)

      return stub.fetch(requestOrUrl, {
        ...requestInit,
        headers
      })
    }
  }

  increment(counterName: string, value = 1) {
    return this.fetch(`/increment/${counterName}`, {
      method: `POST`,
      body: JSON.stringify(value)
    })
  }

  increments(counters: Counters) {
    return this.fetch(`/increments`, {
      method: `POST`,
      body: JSON.stringify(counters)
    })
  }

  write() {
    return this.fetch(`/write`, {
      method: 'POST'
    })
  }

  async counters() {
    const res = await this.fetch(`/counters`)
    if (!res.ok) throw res
    return await res.json<Counters>()
  }
}
