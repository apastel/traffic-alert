import { config } from 'dotenv'
config()

const IFTTT_KEY = process.env.IFTTT_KEY

export function serviceKeyCheck(req, res, next) {
    const key = req.get('IFTTT-Service-Key')

    if (key !== IFTTT_KEY) {
        res.status(401).send({
            errors: [{
                message: 'Service key was invalid'
            }]
        })
    }

    next()
}
