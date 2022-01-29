# DO COUNTER SHARDING

## DEV

`npm start` run DO with miniflare  
`npm run test-counter` test DO by sending a lot /increment requests  

## API

The `:prefix` can be anything. It's the counter name and isolate the increment from other counters. The prefix is useful for having multiple counters.  

### From Worker perspective

#### Global Worker

`/:prefix/global/reset` reset the global count  
`/:prefix/global/count` view total count from global DurableObject storage  
`/:prefix/global/writes` display write events from all shards (useful for understanding how it works)  
`/:prefix/global/shardWrites` display write counts with sum total  
`/:prefix/global/shards` view shards current count  

#### Shard Worker

`/:prefix/shard/:shardNumber/count` view current shard count  
`/:prefix/shard/:shardNumber/write` write to global manually (useful if there was a bug and `exceedMaxCount or afterNoIncrement` did not hit)  

#### Worker

`/:prefix/increment` increment global count by dispatching work to other shards  
`/:prefix/total` view total global count from KV  

### From Stub perspective

#### Global Stub

Use `CounterDurableObject.globalStub(env, prefix)`
`/reset`, `/write`, `/count`, `/writes`, `/shardWrites`, `/shards`

```ts
  const globalStub = CounterDurableObject.globalStub(env, prefix)
  globalStub.fetch(`/reset`)
```

#### Shard Stub

Use `CounterDurableObject.shardStub(env, prefix, shardNumber?)`
`/count`, `/write`, `/increment`

```ts
  const shardStub = CounterDurableObject.shardStub(env, prefix)
  shardStub.fetch(`/increment`)
```

Leaving `shardNumber` empty will randomly choose a shard for you
