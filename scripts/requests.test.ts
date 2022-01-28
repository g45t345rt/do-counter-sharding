import 'isomorphic-fetch'
import inquirer from 'inquirer'

// const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const baseUrl = `http://localhost:8787`

const main = async () => {
  const answers = await inquirer.prompt([
    { name: 'endpoint', type: 'input', message: 'Url endpoint', default: baseUrl },
    { name: 'reset', type: 'confirm', message: 'Reset global count?', default: true },
    { name: 'waitFetch', type: 'confirm', message: 'Wait fetch to finish before sending another?', default: false },
    { name: 'maxCount', type: 'number', message: 'Number of /increment request to send', default: 100 }
  ])

  const { endpoint, reset, waitFetch, maxCount } = answers

  let res = null

  if (reset) {
    let res = await fetch(`${endpoint}/reset`)
    if (!res.ok) throw res
  }

  let counter = 0
  while (counter < maxCount) {
    if (waitFetch) {
      res = await fetch(`${endpoint}/increment`)
      if (!res.ok) throw res
    } else {
      fetch(`${endpoint}/increment`)
    }

    counter++
  }

  console.log(`${counter} requests sent.`)
}

main()
