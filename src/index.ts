import ittyRouter from 'itty-router'
import { nanoid } from 'nanoid'

import { CounterGlobalStub } from './globalStub'
import { CounterShardStub } from './shardStub'
import { nullOrUndefined } from './misc'

type WriteInfoEvent = 'exceedMaxRequest' | 'afterNoRequest' | 'requestWrite'
type WriteInfoCMD = 'writeToKV' | 'writeToGlobal'

export interface Counters {
  [key: string]: number
}

export type WriteInfo = {
  counters: Counters
  shardName: string
  cmd: WriteInfoCMD
  event: WriteInfoEvent
  timestamp: number
}

export abstract class CounterDurableObject implements DurableObject {
  state: DurableObjectState
  env: any
  kv: KVNamespace

  static doNamespace: string
  static kvNamespace: string
  static kvPrefix: string
  static shardCount: number
  static shardMinRequestToGlobal: number
  static shardWriteToGlobalAfter: number
  static globalMinWritesToKV: number
  static globalWriteToKVAfter: number

  shardWriteToGlobalTimeoutId: number
  globalWriteToKVTimeoutId: number

  writes = 0
  requests = 0
  counters: Counters

  shardName: string // assigned by headers in fetch()

  constructor(state: DurableObjectState, env) {
    this.state = state
    this.env = env

    const staticClass = this.getStaticClass()
    const { doNamespace, kvNamespace, kvPrefix, shardCount, shardMinRequestToGlobal, shardWriteToGlobalAfter, globalWriteToKVAfter, globalMinWritesToKV } = staticClass

    if (nullOrUndefined(kvNamespace)) throw `[static kvNamespace] not set.`
    if (nullOrUndefined(doNamespace)) throw `[static doNamespace] not set.`
    if (nullOrUndefined(kvPrefix)) throw `[static kvPrefix] not set.`
    if (nullOrUndefined(shardCount)) throw `[static shardCount] not set.`
    if (nullOrUndefined(shardMinRequestToGlobal)) throw `[static shardMinRequestsToGlobal] not set.`
    if (nullOrUndefined(shardWriteToGlobalAfter)) throw `[static shardWriteToGlobalAfter] not set.`
    if (nullOrUndefined(globalWriteToKVAfter)) throw `[static globalWriteToKVAfter] not set.`
    if (nullOrUndefined(globalMinWritesToKV)) throw `[static globalMinWritesToKV] not set.`

    if (!env[kvNamespace]) throw `KVNamespace [${kvNamespace}] not set in env.`
    this.kv = env[kvNamespace]

    this.state.blockConcurrencyWhile(async () => {
      this.counters = await this.state.storage.get('counters') || {}
    })
  }

  static shardStub(env, shardNumber?: number) {
    const namespace = env[this.doNamespace] as DurableObjectNamespace
    if (!namespace) throw `DurableObject Namespace [${this.doNamespace}] not set in env.`
    return new CounterShardStub({ namespace, shardCount: this.shardCount, shardNumber })
  }

  static globalStub(env) {
    const namespace = env[this.doNamespace] as DurableObjectNamespace
    if (!namespace) throw `DurableObject Namespace [${this.doNamespace}] not set in env.`
    return new CounterGlobalStub(namespace)
  }

  static async kvCounters(env) {
    if (!env[this.kvNamespace]) throw `KVNamespace [${this.kvNamespace}] not set in env.`
    const kv = env[this.kvNamespace] as KVNamespace
    return await kv.get<Counters>(`${this.kvPrefix}~counters`, 'json')
  }

  getStaticClass() {
    return this.constructor as any as typeof CounterDurableObject
  }

  async writeToGlobal(event: WriteInfoEvent) {
    const holdCounters = this.counters // save the count in a temp variable just in case the global write does not work (we don't want to loose the value)
    const holdRequests = this.requests
    this.counters = {}
    this.requests = 0
    this.state.storage.deleteAll()

    const writeInfo = {
      cmd: 'writeToGlobal',
      counters: holdCounters,
      event,
      shardName: this.shardName,
      timestamp: new Date().getTime()
    } as WriteInfo

    const staticClass = this.getStaticClass()
    const globalStub = staticClass.globalStub(this.env)
    const res = await globalStub.write(writeInfo)

    if (!res.ok) {
      // hit here means that we were not able to write to global
      this.assignCounters(holdCounters, this.counters) // we increment the temp value that was not added
      this.requests += holdRequests
      this.saveCounters()
    }
  }

  async writeToKV(event: WriteInfoEvent) {
    this.saveKVCounters()
    const writeInfo = { cmd: 'writeToKV', event, counters: this.counters, shardName: 'global', timestamp: new Date().getTime() } as WriteInfo
    this.saveWriteInfo(writeInfo)
    this.writes = 0
  }

  saveWriteInfo(writeInfo: WriteInfo) {
    const { timestamp } = writeInfo
    const id = nanoid()
    this.state.storage.put(`writes~${timestamp}~${id}`, writeInfo)
  }

  saveCounters() {
    this.state.storage.put(`counters`, this.counters)
  }

  saveKVCounters() {
    const staticClass = this.getStaticClass()
    this.kv.put(`${staticClass.kvPrefix}~counters`, JSON.stringify(this.counters))
  }

  assignCounters(source: Counters, target: Counters) {
    Object.keys(source).forEach(key => {
      const count = source[key]
      if (!target[key]) target[key] = 0
      target[key] += count
    })
  }

  handleGlobalFetch(router: ittyRouter.Router<any>) {
    const staticClass = this.getStaticClass()

    router.post(`/write`, async (request: ittyRouter.Request) => {
      const writeInfo = await request.json() as WriteInfo
      this.assignCounters(writeInfo.counters, this.counters)
      this.writes++
      this.saveCounters()
      this.saveWriteInfo(writeInfo)

      if (this.globalWriteToKVTimeoutId) clearTimeout(this.globalWriteToKVTimeoutId)

      if (staticClass.globalWriteToKVAfter > 0) {
        //@ts-ignore
        this.globalWriteToKVTimeoutId = setTimeout(() => {
          this.writeToKV(`afterNoRequest`)
        }, staticClass.globalWriteToKVAfter)
      }

      if (this.writes > staticClass.globalMinWritesToKV) {
        clearTimeout(this.globalWriteToKVTimeoutId)
        this.writeToKV(`exceedMaxRequest`)
      }

      return new Response(`Global saved.`)
    })

    router.post(`/reset/:counter`, (request: ittyRouter.Request) => {
      const { counter } = request.params
      if (!this.counters[counter]) return new Response(`[${counter}] not defined.`)

      Reflect.deleteProperty(this.counters, counter)
      this.saveCounters()
      return new Response(`[${counter}] reset.`)
    })

    router.get(`/shards`, async () => {
      const shards = []

      for (let i = 0; i < staticClass.shardCount; i++) {
        const stub = staticClass.shardStub(this.env, i)
        const res = await stub.fetch(`/counters`)
        shards[i] = await res.json()
      }

      return new Response(JSON.stringify(shards))
    })

    router.get(`/writes`, async () => {
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
            counters: {},
            writeCount: 0
          }
        }

        const shardInfo = shardWrites[w.shardName]
        this.assignCounters(w.counters, shardInfo.counters)

        shardInfo.writeCount++
      })

      let totalWrite = 0, totalShards = 0
      Object.keys(shardWrites).forEach((k) => {
        const sw = shardWrites[k]
        totalWrite += sw.writeCount
        totalShards++
      })

      return new Response(JSON.stringify({
        shardWrites,
        totalWrite,
        totalShards
      }, null, 2))
    })

    router.get(`/counters`, () => {
      return new Response(JSON.stringify(this.counters))
    })
  }

  handleShardFetch(router: ittyRouter.Router<any>) {
    const staticClass = this.getStaticClass()

    router.post(`/increment/:counter`, async (request: ittyRouter.Request) => {
      const { counter } = request.params

      let value = 1
      const body = await request.text()

      if (body) {
        try {
          const bodyValue = JSON.parse(body)

          if (typeof bodyValue !== 'number') return new Response(`[body] must be a number.`, { status: 400 })
          value = bodyValue
        } catch {
          return new Response(`Invalid json.`, { status: 400 })
        }
      }

      if (this.shardWriteToGlobalTimeoutId) clearTimeout(this.shardWriteToGlobalTimeoutId)

      // Write to global if no increment after a certain amount of time
      if (staticClass.shardWriteToGlobalAfter > 0) {
        //@ts-ignore
        this.shardWriteToGlobalTimeoutId = setTimeout(async () => {
          await this.writeToGlobal('afterNoRequest') // the await is here is IMPORTANT
        }, staticClass.shardWriteToGlobalAfter)
      }

      if (!this.counters[counter]) this.counters[counter] = 0
      this.counters[counter] += value
      this.requests++

      // Directly write to global if it exceed to max amount in buffer
      if (this.requests >= staticClass.shardMinRequestToGlobal) {
        clearTimeout(this.shardWriteToGlobalTimeoutId)
        await this.writeToGlobal('exceedMaxRequest') // the await is here is also IMPORTANT
      } else {
        this.saveCounters()
      }

      return new Response(this.shardName)
    })

    router.post(`/write`, async () => {
      if (Object.keys(this.counters).length === 0) return new Response(`nothing to write`)
      await this.writeToGlobal('requestWrite')
      return new Response(`writeToGlobal`)
    })

    router.get(`/counters`, () => {
      return new Response(JSON.stringify(this.counters))
    })
  }

  async fetch(request: Request) {
    const router = ittyRouter.Router()

    const shardName = request.headers.get(`shardName`)
    if (!shardName) return new Response(`Missing [shardName].`, { status: 400 })
    else this.shardName = shardName

    if (shardName === 'global') this.handleGlobalFetch(router)
    else this.handleShardFetch(router)

    router.all(`*`, () => new Response(`nothing`, { status: 400 }))
    return router.handle(request)
  }
}
