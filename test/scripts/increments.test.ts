import 'isomorphic-fetch'

const main = async () => {
  const res = await fetch(`http://localhost:8787/increments`, {
    method: 'POST',
    body: JSON.stringify({
      'counter1': 1,
      'counter2': 1,
      'counter3': 1
    })
  })

  const test = await res.text()
  console.log(test)
}

main()
