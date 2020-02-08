import express from 'express'
import { post } from 'axios'
import { config } from 'dotenv'
import { serviceKeyCheck } from './middleware'
import { generateUniqueId } from './helpers'
import * as GoogleMaps from '@google/maps'
import { Firestore, FieldValue } from '@google-cloud/firestore'

config()
const { IFTTT_KEY } = process.env
const { GOOGLE_MAPS_KEY } = process.env
const googleMapsClient = GoogleMaps.createClient({
    key: GOOGLE_MAPS_KEY,
    Promise
})
const firestore = new Firestore()

const app = express()
app.use(express.json())

const addDocument = async (collection, id, doc) => {
    console.log(`adding document ${id} to collection ${collection}`)
    const document = firestore.doc(`${collection}/${id}`)
    await document.set(doc)
}

const updateTriggerIdentity = async (triggerIdentity, updateProp) => {
    console.log(`updating trigger identity ${triggerIdentity}`)
    const document = firestore.doc(`triggerIdentities/${triggerIdentity}`)
    await document.update(updateProp, { merge: true })
}

const deleteTriggerIdentityField = async (triggerIdentity, field) => {
    console.log(`deleting field ${field} from triggerIdentity ${triggerIdentity}`)
    const document = firestore.doc(`triggerIdentities/${triggerIdentity}`)
    const snapshot = await document.get()
    if (snapshot.exists) {
        const data = snapshot.data()
        if (field in data) {
            await document.update({
                [field]: FieldValue.delete()
            }, { merge: true })
            console.log('deleted field')
        } else {
            console.log(`field ${field} does not exist for triggerIdentity ${triggerIdentity} with data ${JSON.stringify(data)}`)
         }
    } else {
        console.log('document does not exist for triggerIdentity ', triggerIdentity)
    }
}

const getTriggerIdentity = async (triggerIdentity) => {
    console.log(`get triggerIdentity ${triggerIdentity}`)
    const document = firestore.doc(`triggerIdentities/${triggerIdentity}`)
    try {
        return await document.get()
    } catch (e) {
        return e
    }
}

const deleteTriggerIdentity = async (triggerIdentity) => {
    console.log(`delete triggerIdentity ${triggerIdentity}`)
    const document = firestore.doc(`triggerIdentities/${triggerIdentity}`)
    await document.delete()
}

const withinCommuteTimeWindow = (d1, d2, timeZone) => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone }))
    if (now.getDay() < 1 || now.getDay() > 5) {
        console.log('No commutes on weekends')
        return
    }
    const windowStart = new Date(new Date().toLocaleString('en-US', { timeZone }))
    const windowEnd = new Date(new Date().toLocaleString('en-US', { timeZone }))
    windowStart.setHours(d1.getHours())
    windowStart.setMinutes(d1.getMinutes())
    windowStart.setSeconds(0)
    windowEnd.setHours(d2.getHours())
    windowEnd.setMinutes(d2.getMinutes())
    windowEnd.setSeconds(0)
    console.log(`${windowStart} <= ${now} <= ${windowEnd}`)
    return now >= windowStart && now <= windowEnd
}

const commuteHasDecreasedSincePreviousNotification = async (triggerIdentity, durationInTraffic) => {
    const amountDecreased = 5 // minutes
    const triggerIdObj = await getTriggerIdentity(triggerIdentity)
    const { lastNotifiedDuration } = triggerIdObj.data()
    if (!lastNotifiedDuration) {
        console.log(`${triggerIdentity}: No prior notification for this time window`)
        return true
    }
    if (durationInTraffic <= lastNotifiedDuration - amountDecreased) {
        console.log(`${triggerIdentity}: Commute decreased at least ${amountDecreased} minutes since last notification`)
        return true
    }
    console.log(`${triggerIdentity}: Commute has not decreased by ${amountDecreased} min since last notification at ${lastNotifiedDuration}`)
    return false
}

const createEventsArray = async (limit) => {
    console.log('creating events array, limit is ', limit)
    if (limit <= 0) {
        return []
    }
    const query = await firestore.collection('events').orderBy('meta.timestamp', 'desc').limit(limit).get()
    const events = []
    query.forEach(event => {
        events.push(event.data())
    })
    events.forEach(event => console.log(`${event.meta.id} ${event.meta.timestamp}`))
    return events
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
    async (req, res) => {
        const triggerIdentity = req.body.trigger_identity
        const originAddress = req.body.triggerFields.origin_address
        const destinationAddress = req.body.triggerFields.destination_address
        const thresholdDuration = parseInt(
            req.body.triggerFields.threshold_duration, 10
        )
        const windowStart = req.body.triggerFields.commute_window_start
        const windowEnd = req.body.triggerFields.commute_window_end
        const limit = (req.body.limit != null) ? req.body.limit : 50
        const timeZone = req.body.user.timezone
        const d1 = new Date(new Date().toLocaleString('en-US', { timeZone }))
        d1.setHours(parseInt(windowStart))
        d1.setMinutes(0)
        d1.setSeconds(0)
        const d2 = new Date(new Date().toLocaleString('en-US', { timeZone }))
        d2.setHours(parseInt(windowEnd))
        d2.setMinutes(0)
        d2.setSeconds(0)
        const document = await getTriggerIdentity(triggerIdentity)
        if (!document.exists) {
            const doc = {
                timeZone,
                windowStart: d1,
                windowEnd: d2
            }
            addDocument('triggerIdentities', triggerIdentity, doc)
        }
        console.log(`trigger_identity: ${triggerIdentity}`)
        if (!withinCommuteTimeWindow(d1, d2, timeZone)) {
            console.log('Not within commute time window.')
            await deleteTriggerIdentityField(triggerIdentity, 'lastNotifiedDuration')
            res.status(200).send({ data: await createEventsArray(limit) })
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
            .then(async (response) => {
                const { summary } = response.json.routes[0]
                const durationInTraffic = Math.round(
                    response.json.routes[0].legs[0].duration_in_traffic.value / 60
                )
                console.log(`Summary: ${summary}`)
                console.log(`Commute time: ${durationInTraffic}`)
                console.log(`Threshold duration: ${thresholdDuration}`)

                if (durationInTraffic <= thresholdDuration) {
                    console.log(`${triggerIdentity}: Commute is below threshold`)
                    if (await commuteHasDecreasedSincePreviousNotification(triggerIdentity, durationInTraffic)) {
                        console.log('Generating trigger data')
                        updateTriggerIdentity(triggerIdentity, { lastNotifiedDuration: durationInTraffic })
                        const event = {
                            commute_duration: durationInTraffic,
                            origin_address: originAddress,
                            destination_address: destinationAddress,
                            route_to_take: summary,
                            created_at: new Date().toISOString(), // Must be a valid ISOString
                            meta: {
                                id: generateUniqueId(),
                                timestamp: Math.floor(Date.now() / 1000) // This returns a unix timestamp in seconds.
                            }
                        }
                        await addDocument('events', event.meta.id, event)
                    }
                }
                res.status(200).send({
                    data: await createEventsArray(limit)
                })
            })
            .catch((err) => {
                console.log(err)
                res.status(500).send()
            })
    }
)

app.delete('/ifttt/v1/triggers/threshold_reached/trigger_identity/:triggerId', serviceKeyCheck, async (req, res) => {
    const triggerIdentity = req.params.triggerId
    const document = await getTriggerIdentity(triggerIdentity)
    if (document.exists) {
        deleteTriggerIdentity(triggerIdentity)
        console.log('Deleted trigger identity', triggerIdentity)
    } else {
        console.log(`Trigger identity ${triggerIdentity} not found in database`)
    }
    res.status(200).send()
})

const listener = app.listen(process.env.PORT, () => {
    console.log(`Your app is listening on port ${listener.address().port}`)
})

const enableRealtimeAPI = async () => {
    const documents = await firestore.collection('triggerIdentities').get()
    documents.forEach(async (triggerIdDoc) => {
        console.log(`${triggerIdDoc.id}: Checking if within commute window for Realtime API`)
        const { windowStart, windowEnd, timeZone } = triggerIdDoc.data()
        if (withinCommuteTimeWindow(windowStart.toDate(), windowEnd.toDate(), timeZone)) {
            post('https://realtime.ifttt.com/v1/notifications',
                {
                    data: [{
                        trigger_identity: triggerIdDoc.id
                    }]
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'IFTTT-Service-Key': IFTTT_KEY
                    }
                }
            )
                .then((response) => {
                    console.log('Notified IFTTT to poll trigger_identity', triggerIdDoc.id)
                })
                .catch((error) => {
                    console.error(error)
                })
        } else {
            console.log(`${triggerIdDoc.id}: Not within commute window for Realtime API`)
            await deleteTriggerIdentityField(triggerIdDoc.id, 'lastNotifiedDuration')
        }
    })
}

setInterval(enableRealtimeAPI, 60000)
