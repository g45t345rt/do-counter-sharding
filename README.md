# DO COUNTER SHARDING

## NPM

`npm i do-counter-sharding`

## How to use

1. Create you own class and extends from CounterDurableObject.
Do not export `CounterDurableObject` directly as a durable_object binding.  
2. Set your preferences and export your class instead.  

```ts
import { CounterDurableObject } from 'do-counter-sharding'

class Metrics extends CounterDurableObject {
  static doNamespace = `METRICS_DO` // binding name of your wrangler.toml
  static kvNamespace = `KV` // kv_namespace binding name in your wrangler.toml
  static kvPrefix = `metrics` // prefix used when storing counters to KV - metrics~counters
  static shardCount = 2 // number of shards that you want - can be change anytime - this should handle 200requests/s
  static shardMinRequestToGlobal = 100  // higher number will write to global less often
  static shardWriteToGlobalAfter = 1000 * 5 // 5s in ms - if the DO does not receive anymore increment after 5s it will write to the global counter
  static globalMinWritesToKV = 100 // higher number will write to KV less often
  static globalWriteToKVAfter = 1000 * 5// 5s in ms - if the DO does not receive anymore write from shards after 5s it will write to KV
}

export default {
  fetch: (request, env) => {
    const globalStub = Metrics.globalStub(env)
    // globalStub.fetch()
    const shardStub = Metrics.shardStub(env, Number(shardNumber))
    // shardStub.fetch()
    return new Response()
  }
}

export { Metrics }
```

## API

### From Worker perspective

Check the test file ./test/index.ts how to implement in a worker

#### Global Worker

`/global/reset/:counterName` reset specifc counter from global  
`/global/counters` view global counters from global DurableObject storage  
`/global/writes` display write events from all shards (useful for understanding how it works)  
`/global/shardWrites` display write counts with sum total  
`/global/shards` view shards current count  

#### Shard Worker

`/shard/:shardNumber/counters` view current shard counters
`/shard/:shardNumber/write` write to global manually (useful if there was a bug and `exceedMaxCount or afterNoIncrement` did not hit)  

#### Worker

`/increment/:counterName` increment a global counter by dispatching work to other shards  
`/counters` view global counters from KV

### From Stub perspective

#### Global Stub

Use `CounterDurableObject.globalStub(env)`
`/reset/:counterName`, `/write`, `/counters`, `/writes`, `/shardWrites`, `/shards`

```ts
  // Metrics is a class extending CounterDurableObject
  const globalStub = Metrics.globalStub(env)
  globalStub.fetch(`/reset/{counterName}`)
```

#### Shard Stub

Use `CounterDurableObject.shardStub(env, shardNumber?)`
`/counters`, `/write`, `/increment/:counter`

```ts
  const shardStub = Metrics.shardStub(env)
  shardStub.fetch(`/increment/{counterName}`)
```

Leaving `shardNumber` empty will randomly choose a shard for you

## DEV

`npm run build` build files for publishing npm package  
`npm run build-test` build test worker - used my miniflare  
`npm run test` run Worker DO with miniflare  
`npm run test-counter` run test scripts to send /increment post requests  
