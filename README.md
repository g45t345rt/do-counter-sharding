# DO COUNTER SHARDING

## DEV

`npm start` run DO with miniflare
`npm run test-counter` test DO by sending a lot /increment requests

## API

`/reset` reset the global count
`/writes` display write events from all shards (useful for understanding how it works)
`/increment` increment global count by dispatching to other shards
`/total` view total global count
