import express from 'express'
import { post } from 'axios'
import { config } from 'dotenv'
import { serviceKeyCheck } from './middleware'
import { generateUniqueId } from './helpers'

config()
const { IFTTT_KEY } = process.env
const { GOOGLE_MAPS_KEY } = process.env
const googleMapsClient = require('@google/maps').createClient({
    key: GOOGLE_MAPS_KEY,
    Promise
})

const store = {}
const app = express()
app.use(express.json())

const withinCommuteTimeWindow = (d1, d2, timeZone) => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone }))
    return now >= d1 && now <= d2
}

const commuteHasDecreasedSincePreviousNotification = (triggerIdentity, durationInTraffic) => {
    const amountDecreased = 5 // minutes
    if (!store[triggerIdentity].lastNotifiedDuration) {
        console.log(`${triggerIdentity}: No prior notification for this time window`)
        console.log(`${JSON.stringify(store)}`)
        return true
    }
    if (durationInTraffic <=
        store[triggerIdentity].lastNotifiedDuration - (amountDecreased * store[triggerIdentity].thresholdMultiplier)) {
        console.log(`${triggerIdentity}: Commute decreased at least ${amountDecreased} minutes since last notification`)
        return true
    }
    console.log(`${triggerIdentity}: Commute has not decreased by ${amountDecreased} min since last notification at ${store[triggerIdentity].lastNotifiedDuration}`)
    return false
}

// The status
app.get('/', (req, res) => {
    res
        .status(200)
        .send("Bitchin', the server is running.")
        .end()
})

// The status
app.get('/ifttt/v1/status', serviceKeyCheck, (req, res) => {
    res.status(200).send()
})

app.get('/data', (req, res) => {
    res.status(200).send(JSON.stringify(store, null, 2))
})

// The test/setup endpoint
app.post('/ifttt/v1/test/setup', serviceKeyCheck, (req, res) => {
    res.status(200).send({
        data: {
            samples: {
                triggers: {
                    threshold_reached: {
                        threshold_duration: '15',
                        origin_address: '123 fake st',
                        destination_address: 'qualcomm',
                        commute_window_start: '17',
                        commute_window_end: '19'
                    }
                }
            }
        }
    })
})

// Trigger endpoints
app.post(
    '/ifttt/v1/triggers/threshold_reached',
    serviceKeyCheck,
    (req, res) => {
        const triggerIdentity = req.body.trigger_identity
        const originAddress = req.body.triggerFields.origin_address
        const destinationAddress = req.body.triggerFields.destination_address
        const thresholdDuration = parseInt(
            req.body.triggerFields.threshold_duration, 10
        )
        const windowStart = req.body.triggerFields.commute_window_start
        const windowEnd = req.body.triggerFields.commute_window_end
        const timeZone = req.body.user.timezone
        const d1 = new Date(new Date().toLocaleString('en-US', { timeZone }))
        d1.setHours(parseInt(windowStart))
        d1.setMinutes(0)
        d1.setSeconds(0)
        const d2 = new Date(new Date().toLocaleString('en-US', { timeZone }))
        d2.setHours(parseInt(windowEnd))
        d2.setMinutes(0)
        d2.setSeconds(0)
        if (!Object.keys(store).includes(triggerIdentity)) {
            store[triggerIdentity] = {
                thresholdMultiplier: 0,
                timeZone,
                windowStart: d1,
                windowEnd: d2
            }
        }
        console.log(`trigger_identity: ${triggerIdentity}`)
        const data = []
        if (!withinCommuteTimeWindow(d1, d2, timeZone)) {
            console.log('Not within commute time window.')
            store[triggerIdentity].thresholdMultiplier = 0
            res.status(200).send({ data })
            return
        }
        console.log(
            `Getting directions...\nStart: ${originAddress}\nEnd: ${destinationAddress}`
        )
        googleMapsClient
            .directions({
                origin: originAddress,
                destination: destinationAddress,
                departure_time: 'now'
            })
            .asPromise()
            .then((response) => {
                const { summary } = response.json.routes[0]
                const durationInTraffic = Math.round(
                    response.json.routes[0].legs[0].duration_in_traffic.value / 60
                )
                console.log(`Summary: ${summary}`)
                console.log(`Commute time: ${durationInTraffic}`)
                console.log(`Threshold duration: ${thresholdDuration}`)

                if (durationInTraffic <= thresholdDuration) {
                    console.log(`${triggerIdentity}: Commute is below threshold`)
                    if (commuteHasDecreasedSincePreviousNotification(triggerIdentity, durationInTraffic)) {
                        console.log('Generating trigger data')
                        store[triggerIdentity].lastNotifiedDuration = durationInTraffic
                        store[triggerIdentity].thresholdMultiplier++
                        data.push({
                            commute_duration: durationInTraffic,
                            origin_address: originAddress,
                            destination_address: destinationAddress,
                            route_to_take: summary,
                            created_at: new Date().toISOString(), // Must be a valid ISOString
                            meta: {
                                id: generateUniqueId(),
                                timestamp: Math.floor(Date.now() / 1000) // This returns a unix timestamp in seconds.
                            }
                        })
                    }
                } else {
                    delete store[triggerIdentity].lastNotifiedDuration
                }

                res.status(200).send({
                    data
                })
            })
            .catch((err) => {
                console.log(err)
                res.status(500).send()
            })
    }
)

app.delete('/ifttt/v1/triggers/threshold_reached/trigger_identity/:triggerId', serviceKeyCheck, (req, res) => {
    const triggerIdentity = req.params.triggerId
    if (store[triggerIdentity]) {
        delete store[triggerIdentity]
        console.log(`Deleted trigger identity ${triggerIdentity}`)
    } else {
        console.log(`Trigger identity ${triggerIdentity} not found in database`)
    }
    res.status(200).send()
})

const listener = app.listen(process.env.PORT, () => {
    console.log(`Your app is listening on port ${listener.address().port}`)
})

function enableRealtimeAPI () {
    Object.keys(store).forEach((triggerIdentity) => {
        console.log(`${triggerIdentity}: Checking if within commute window for Realtime API`)
        if (withinCommuteTimeWindow(store[triggerIdentity].windowStart, store[triggerIdentity].windowEnd, store[triggerIdentity].timeZone)) {
            post('https://realtime.ifttt.com/v1/notifications',
                {
                    data: [{
                        trigger_identity: triggerIdentity
                    }]
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'IFTTT-Service-Key': IFTTT_KEY
                    }
                }
            )
                .then((response) => {
                    console.log(`Notified IFTTT to poll trigger_identity ${triggerIdentity}`)
                })
                .catch((error) => {
                    console.error(error)
                })
        } else {
            console.log(`${triggerIdentity}: Not within commute window for Realtime API`)
        }
    })
}

setInterval(enableRealtimeAPI, 60 * 1000)
