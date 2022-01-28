//@ts-ignore
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const main = async () => {
  let res = await fetch(`http://localhost:8787/reset`)
  if (!res.ok) throw res

  let counter = 0
  while (counter < 1000) {
    res = await fetch(`http://localhost:8787/increment`)
    if (!res.ok) throw res

    counter++
  }

  console.log(`Waiting for 6s... - write after is set to 5s`)
  await sleep(1000 * 6)
  res = await fetch(`http://localhost:8787/total`)
  if (!res.ok) throw res

  const total = await res.json()

  console.log(`Local counter: ${counter} | External counter: ${total}`)
}

main()
