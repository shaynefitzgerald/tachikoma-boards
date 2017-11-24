const urlencoded = require('body-parser').urlencoded({
  'extended' : false
});
const init = () => {
  return new Promise(function(resolve, reject) {
    return resolve({});
  });
};

exports.urlencoded = urlencoded;
exports.init = init;
