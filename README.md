# DO COUNTER SHARDING

## DEV

`npm start` run DO with miniflare  
`npm run test-counter` test DO by sending a lot /increment requests  

## Extends CounterDurableObject class

Do not export `CounterDurableObject` directly as a binding.  
Extend from another class to set your preferences and bind it with your class instead.  

```ts
class Metrics extends CounterDurableObject {
  static doNamespace = `METRICS_DO` // binding name of your wrangler.toml
  static kvPrefix = `metrics` // prefix used when storing counters to KV - metrics~counters
  static shardCount = 2 // number of shards that you want - can be change anytime - this should handle 200requests/s
  static shardMinRequestToGlobal = 100  // higher number will write to global less often
  static shardWriteToGlobalAfter = 1000 * 5 // 5s in ms - if the DO does not receive anymore increment after 5s it will write to the global counter
  static globalMinWritesToKV = 100 // higher number will write to KV less often
  static globalWriteToKVAfter = 1000 * 5// 5s in ms - if the DO does not receive anymore write from shards after 5s it will write to KV
}
```

## API

### From Worker perspective

#### Global Worker

`/global/reset` reset all counters from global  
`/global/counters` view global counters from global DurableObject storage  
`/global/writes` display write events from all shards (useful for understanding how it works)  
`/global/shardWrites` display write counts with sum total  
`/global/shards` view shards current count  

#### Shard Worker

`/shard/:shardNumber/counters` view current shard counters
`/shard/:shardNumber/write` write to global manually (useful if there was a bug and `exceedMaxCount or afterNoIncrement` did not hit)  

#### Worker

`/increment/:counter` increment a global counter by dispatching work to other shards  
`/counters` view global counters from KV

### From Stub perspective

#### Global Stub

Use `CounterDurableObject.globalStub(env)`
`/reset`, `/write`, `/counters`, `/writes`, `/shardWrites`, `/shards`

```ts
  // Metrics is a class extending CounterDurableObject
  const globalStub = Metrics.globalStub(env)
  globalStub.fetch(`/reset`)
```

#### Shard Stub

Use `CounterDurableObject.shardStub(env, shardNumber?)`
`/counters`, `/write`, `/increment/:counter`

```ts
  const shardStub = Metrics.shardStub(env)
  shardStub.fetch(`/increment/{counterName}`)
```

Leaving `shardNumber` empty will randomly choose a shard for you
