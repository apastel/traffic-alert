// server.js

// init project
const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const app = express();

const middleware = require('./middleware');
const helpers = require('./helpers');

dotenv.config();
const IFTTT_KEY = process.env.IFTTT_KEY;
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY;
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));
const googleMapsClient = require('@google/maps').createClient({
  key: GOOGLE_MAPS_KEY,
  Promise: Promise
});

// The status
app.get('/ifttt/v1/status', middleware.serviceKeyCheck, (req, res) => {
  res.status(200).send();
});

// The test/setup endpoint
app.post('/ifttt/v1/test/setup', middleware.serviceKeyCheck, (req, res) => {
  res.status(200).send({
    "data": {
      samples: {
        triggers: {
          threshold_reached: { 
            threshold_duration: "15",
            origin_address: "123 fake st",
            destination_address: "qualcomm"
          }
        }
      }
    }
  });
});

// Trigger endpoints
app.post('/ifttt/v1/triggers/threshold_reached', (req, res) => {
  
  const key = req.get("IFTTT-Service-Key");
  
  if (key !== IFTTT_KEY) {
    res.status(401).send({
      "errors": [{
        "message": "Channel/Service key is not correct"
      }]
    });
  }
  
  let data = [];
  const originAddress = req.body.triggerFields.origin_address;
  const destinationAddress = req.body.triggerFields.destination_address;
  const thresholdDuration = parseInt(req.body.triggerFields.threshold_duration);
  console.log(`Getting directions...\nStart: ${originAddress}\nEnd: ${destinationAddress}`);
  let summary;
  let durationInTraffic;
  googleMapsClient
    .directions({ 
      origin: originAddress,
      destination: destinationAddress,
      departure_time: 'now'
    })
    .asPromise()
    .then(response => {
      // console.log(JSON.stringify(response, null, 2));
      summary = response.json.routes[0].summary;
      durationInTraffic = Math.round(response.json.routes[0].legs[0].duration_in_traffic.value / 60);
      console.log(`Summary: ${summary}`);
      console.log(`Duration in traffic: ${durationInTraffic}`);
      console.log(`Threshold duration: ${thresholdDuration}`);
      if (durationInTraffic <= thresholdDuration) {
        console.log("threshold reached...");
        data.push({
          commute_duration: durationInTraffic,
          origin_address: originAddress,
          destination_address: destinationAddress,
          route_to_take: summary,
          created_at: new Date().toISOString(), // Must be a valid ISOString
          meta: {
            id: helpers.generateUniqueId(),
            timestamp: Math.floor(Date.now() / 1000) // This returns a unix timestamp in seconds.
          }
        });
      }
      
      res.status(200).send({
        "data": data
      });
    })
    .catch(err => {
      console.log(err);
    });

});

// Action endpoints
app.post('/ifttt/v1/actions/create_new_thing', (req, res) => {
  
  const key = req.get("IFTTT-Service-Key");
  
  if (key !== IFTTT_KEY) {
    res.status(401).send({
      "errors": [{
        "message": "Channel/Service key is not correct"
      }]
    });
  }
  
  res.status(200).send({
    "data": [{
      "id": helpers.generateUniqueId()
    }]
  });
  
});

// listen for requests :)

app.get('/', (req, res) => {
  res.render('index.ejs');
});

const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
