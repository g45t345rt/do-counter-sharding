# DO COUNTER SHARDING

## DEV

`npm start` run DO with miniflare  
`npm run test-counter` test DO by sending a lot /increment requests  

## API

`/global/reset` reset the global count  
`/global/count` view total count from global DurableObject  
`/global/writes` display write events from all shards (useful for understanding how it works)  
`/global/shardWrites` display write counts with sum total (check if match with `/global/count`)  
`/global/shards` view shards current count  
`/:shardNumber/count` view current shard count  
`/increment` increment global count by dispatching work to other shards  
`/total` view total global count from KV  
