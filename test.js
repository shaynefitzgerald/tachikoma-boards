const express = require('express');
const imageboard = require('./imgb.js');

const testServer = express();

imageboard.init(testServer, '').then((app) => {
  app.listen(8080);
}).catch((e) =>  { console.log(e); });
