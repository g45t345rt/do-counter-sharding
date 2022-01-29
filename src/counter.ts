import { Router } from 'itty-router'
import { nanoid } from 'nanoid'

import { mergeHeaders } from './misc'

type WriteInfoEvent = 'exceedMaxCount' | 'afterNoIncrement' | 'writeToKV' | 'requestWrite'

type WriteInfo = {
  count: number
  shardName: string
  event: WriteInfoEvent,
  timestamp: number
}

export default class CounterDurableObject implements DurableObject {
  state: DurableObjectState
  env: EnvInterface

  static shardCount = 10 // 10 shards meaning we could handle 10*100 - 1000 requests per seconds

  shardMinCountToGlobal = 100 // higher number will write to global less often
  shardWriteToGlobalAfter = 1000 * 5 // 5s - if a DO does not receive anymore increment after 5s it will write to the global counter
  shardWriteToGlobalTimeoutId: number

  globalMinWritesToKV = 100
  globalWriteToKVAfter = 1000 * 5
  globalWriteToKVTimeoutId: number

  writes = 0
  count = 0

  // assigned by headers in fetch()
  shardName: string
  prefix: string

  constructor(state: DurableObjectState, env: EnvInterface) {
    this.state = state
    this.env = env

    this.state.blockConcurrencyWhile(async () => {
      this.count = await this.state.storage.get('count') || 0
    })
  }

  static shardStub(env: EnvInterface, prefix: string, shardNumber?: number) {
    if (shardNumber === null || shardNumber === undefined) {
      shardNumber = Math.floor(Math.random() * CounterDurableObject.shardCount)
    }

    const id = env.COUNTER_DO.idFromName(`${prefix}~shard${shardNumber}`)
    const stub = env.COUNTER_DO.get(id)

    return {
      ...stub,
      fetch: (requestOrUrl: string | Request, requestInit?: Request | RequestInit) => {
        let headers = mergeHeaders(requestOrUrl, requestInit)

        // Pass shardName in headers to know where the writeToGlobal comes from
        headers.set(`prefix`, prefix)
        headers.set(`shardName`, stub.name)

        return stub.fetch(requestOrUrl, {
          ...requestInit,
          headers
        })
      }
    }
  }

  static globalStub(env: EnvInterface, prefix: string) {
    const id = env.COUNTER_DO.idFromName(`${prefix}~global`)
    const stub = env.COUNTER_DO.get(id)

    return {
      ...stub,
      fetch: (requestOrUrl: string | Request, requestInit?: Request | RequestInit) => {
        let headers = mergeHeaders(requestOrUrl, requestInit)
        headers.set(`prefix`, prefix)
        headers.set(`shardName`, `global`)

        return stub.fetch(requestOrUrl, {
          ...requestInit,
          headers
        })
      }
    }
  }

  static async kvTotal(env: EnvInterface, prefix: string) {
    return await env.KV.get(`${prefix}~total`) || 0
  }

  async writeToGlobal(event: WriteInfoEvent, shardName: string) {
    const holdCount = this.count // save the count in a temp variable just in case the global write does not work (we don't want to loose the value)
    this.count = 0
    this.state.storage.deleteAll()

    const writeInfo = {
      count: holdCount,
      event,
      shardName,
      timestamp: new Date().getTime()
    } as WriteInfo

    const globalStub = CounterDurableObject.globalStub(this.env, this.prefix)
    const res = await globalStub.fetch(`/write`, {
      method: 'POST',
      body: JSON.stringify(writeInfo)
    })

    if (!res.ok) {
      // hit here means that we were not able to write to global
      this.count += holdCount // we increment the temp value that was not added
      this.state.storage.put(`count`, this.count)
    }
  }

  async writeToKV() {
    this.env.KV.put(`${this.prefix}~total`, JSON.stringify(this.count))
    const writeInfo = { event: 'writeToKV', count: this.count, shardName: 'global', timestamp: new Date().getTime() } as WriteInfo
    this.putWriteInfo(writeInfo)
    this.writes = 0
  }

  putWriteInfo(writeInfo: WriteInfo) {
    const { timestamp } = writeInfo
    const id = nanoid()
    this.state.storage.put(`writes~${timestamp}~${id}`, writeInfo)
  }

  handleGlobalFetch(router: Router<any>) {
    router.post(`/write`, async (request: Request) => {
      const writeInfo = await request.json<WriteInfo>()
      this.count += writeInfo.count
      this.writes++
      this.state.storage.put(`count`, this.count)
      this.putWriteInfo(writeInfo)

      if (this.globalWriteToKVTimeoutId) clearTimeout(this.globalWriteToKVTimeoutId)

      //@ts-ignore
      this.globalWriteToKVTimeoutId = setTimeout(() => {
        console.log(`timeout writeToKV`)
        this.writeToKV()
      }, this.globalWriteToKVAfter)

      if (this.writes > this.globalMinWritesToKV) {
        console.log(`max exceed writeToKV`)
        clearTimeout(this.globalWriteToKVTimeoutId)
        this.writeToKV()
      }

      return new Response(`Global saved.`)
    })

    router.get(`/reset`, () => {
      this.count = 0
      this.state.storage.deleteAll()
      this.env.KV.put(`${this.prefix}~total`, JSON.stringify(this.count))
      return new Response(`Global reset.`)
    })

    router.get(`/shards`, async () => {
      const counts = []
      for (let i = 0; i < CounterDurableObject.shardCount; i++) {
        const stub = CounterDurableObject.shardStub(this.env, this.prefix, i)
        const res = await stub.fetch(`/count`)
        counts[i] = await res.json()
      }

      return new Response(JSON.stringify(counts))
    })

    router.get(`/writes`, async (request: Request) => {
      const result = await this.state.storage.list<WriteInfo>({ prefix: `writes~`, reverse: true })
      const writes = [...result]

      return new Response(JSON.stringify(writes.map(([_, w]) => w), null, 2))
    })

    router.get(`/shardWrites`, async () => {
      const result = await this.state.storage.list<WriteInfo>({ prefix: `writes~`, reverse: true })
      const writes = [...result]
      const shardWrites = {}

      writes.map(([_, w]) => w).forEach((w) => {
        if (w.shardName === 'global') return
        if (!shardWrites[w.shardName]) {
          shardWrites[w.shardName] = {
            incrementCount: 0,
            writeCount: 0
          }
        }

        shardWrites[w.shardName].incrementCount += w.count
        shardWrites[w.shardName].writeCount++
      })

      let totalCount = 0, totalWrite = 0, totalShards = 0
      Object.keys(shardWrites).forEach((k) => {
        const sw = shardWrites[k]
        totalCount += sw.incrementCount
        totalWrite += sw.writeCount
        totalShards++
      })

      return new Response(JSON.stringify({
        shardWrites,
        totalCount,
        totalWrite,
        totalShards
      }, null, 2))
    })

    router.get(`/count`, () => {
      return new Response(JSON.stringify(this.count))
    })
  }

  handleShardFetch(router: Router<any>) {
    router.get(`/increment`, async () => {
      if (this.shardWriteToGlobalTimeoutId) clearTimeout(this.shardWriteToGlobalTimeoutId)

      //@ts-ignore
      // Write to global if no increment after a certain amount of time
      this.shardWriteToGlobalTimeoutId = setTimeout(async () => {
        console.log(`timeout writeToGlobal`)
        await this.writeToGlobal('afterNoIncrement', this.shardName) // the await is here is IMPORTANT
      }, this.shardWriteToGlobalAfter)

      this.count += 1
      // Directly write to global if it exceed to max amount in buffer
      if (this.count >= this.shardMinCountToGlobal) {
        console.log(`max exceed writeToGlobal`)
        clearTimeout(this.shardWriteToGlobalTimeoutId)
        await this.writeToGlobal('exceedMaxCount', this.shardName) // the await is here is also IMPORTANT
      } else {
        this.state.storage.put(`count`, this.count)
      }

      return new Response(this.shardName)
    })

    router.get(`/write`, async () => {
      if (this.count === 0) return new Response(`nothing to write`)
      await this.writeToGlobal('requestWrite', this.shardName) 
      return new Response(`writeToGlobal`)
    })

    router.get(`/count`, () => {
      return new Response(JSON.stringify(this.count))
    })
  }

  async fetch(request: Request) {
    const router = Router()

    const shardName = request.headers.get(`shardName`)
    if (!shardName) return new Response(`Missing [shardName].`, { status: 400 })
    else this.shardName = shardName

    const prefix = request.headers.get(`prefix`)
    if (!prefix) return new Response(`Missing [prefix].`, { status: 400 })
    else this.prefix = prefix

    if (shardName === 'global') this.handleGlobalFetch(router)
    else this.handleShardFetch(router)

    router.all(`*`, () => new Response(`nothing`, { status: 400 }))
    return router.handle(request)
  }
}
