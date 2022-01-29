import 'isomorphic-fetch'
import inquirer from 'inquirer'

// const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const baseUrl = `http://localhost:8787`

const main = async () => {
  const answers = await inquirer.prompt([
    { name: 'endpoint', type: 'input', message: 'Url endpoint', default: baseUrl },
    { name: 'prefix', type: 'input', message: 'Counter prefix' },
    { name: 'reset', type: 'confirm', message: 'Reset global count?', default: true },
    { name: 'maxCount', type: 'number', message: 'Number of /increment request to send', default: 100 }
  ])

  const { endpoint, reset, maxCount, prefix } = answers

  let res = null

  if (reset) {
    res = await fetch(`${endpoint}/${prefix}/global/reset`)
    if (!res.ok) throw res
  }

  let counter = 0
  let failedIncrement = 0
  const fetchIncrement = async () => {
    const res = await fetch(`${endpoint}/${prefix}/increment`)
    if (!res.ok) {
      console.log(res)
      failedIncrement++
    }
  }

  const requests = []
  while (counter < maxCount) {
    requests.push(fetchIncrement()) // don't await here send all the request right away (simulate a burst)
    counter++
  }

  await Promise.all(requests)

  console.log(`${counter} requests sent, ${failedIncrement} failed, counter should be ${counter - failedIncrement}.`)
}

main()
