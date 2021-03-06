# traffic-alert

NodeJS server backend to connect to an IFTTT service for getting notifications when your commute duration is below a tolerable threshold. Uses Google Maps Directions API. Deploys in Google Cloud App Engine.

## Why Did I Make This?

Google Maps does a great job of telling me my commute times. I can open the app any time and find out how long it will take me to get home, or get to work.

But sometimes I don't want to keep checking the app or the website to see my commute length. I would rather just receive a notification when my commute is below some threshhold I set, like 25 minutes. Because my work hours are pretty flexible, I can wait until my commute duration is below this threshhold before getting in the car. That way I spend less time on the road and more time doing meaningful things, like brushing my teeth or typing up README files.

### But Doesn't Google Maps Already Have This Sort of Thing

Yes. And it works.....sort of.

Google Maps has a "Commute" feature where you can tell it your "Home", your "Work", and the times you typically commute. You'll get a notification during your commute window that shows your current commute time. Sometimes. It doesn't always show up when you expect it to. And while it seems like the notification updates every 5 minutes, often I will tap the notification and let it take me to Google Maps and it will show me a different commute length. Morever, I wanted a notification that I can receive as a desktop notification on my computer (the thing I'm always on at work), instead of having to unlock and check my phone.

### How to Use

Because an IFTTT developer license is $199/year, I decided not to publish my IFTTT service. If you want to use traffic-alert you will have to create your own private IFTTT service as I did, and point it at a running instance of a traffic-alert NodeJS server. Most likely you will not do any of this, as this app is sort of a very specific need that I had. If you find yourself wanting this to be a real IFTTT service, just tell me and maybe I'll publish it if I get a few inquiries about it.

More likely this will serve as an example of how to create your own IFTTT service.

## Creating an IFTTT Service

IFTTT has plenty of documentation on how to create your own service. Use `server.js` as an example of how to do things like create triggers, set up endpoint tests, and use the IFTTT Realtime API.

## Technologies Used
  * [Google Maps Directions API](https://developers.google.com/maps/documentation/directions/start)
  * [IFTTT](https://platform.ifttt.com/)
  * [Google Cloud Platform](https://cloud.google.com/)
  * [Cloud Firestore](https://firebase.google.com/docs/firestore)
  * [NodeJS](nodejs.org)
  * [git-secret](https://git-secret.io/)
  * [eslint](https://eslint.org/)
  * [axios](https://github.com/axios/axios)