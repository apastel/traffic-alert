const dotenv = require('dotenv');
dotenv.config();

const IFTTT_KEY = process.env.IFTTT_KEY;

module.exports = {
  
  serviceKeyCheck: function (req, res, next) {

    const key = req.get("IFTTT-Service-Key");
    
    if (key !== IFTTT_KEY) {
      res.status(401).send();
    }

    next();
    
  }
};