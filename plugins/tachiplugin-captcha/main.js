const fs = require('fs');
const path = require('path');

const shortid = require('shortid')
  .generate;
const sprintf = require('sprintf-js').sprintf;
const urlencoded = require('body-parser')
  .urlencoded({
    'extended': false
  });

const plugin = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'plugin.json')).toString()
);
const config = plugin.captchaConfig;
const pluginID = `${plugin.name}:${plugin.version}`;

const captcha = require(path.join(__dirname, 'node-captcha.js'));
const templates = require(path.join(__dirname, '..', '..', 'templateEngine.js'));

const hookRoutes = (ctx, storage, router) => {
  router.param('id', (req, res, next, id) => {
    if (storage.keys()
      .indexOf(`captcha-${id}`) === -1)
      return next(`No Such Captcha ${id}`);
    else {
      req.params.id = id;
      return next();
    }
  });
  router.get('/captcha/res/captcha.js', (req, res) => {
    return res.sendFile(path.join(__dirname, 'res', 'captcha.js'));
  });
  router.get('/captcha/res/captcha.css', (req, res) => {
    return res.sendFile(path.join(__dirname, 'res', 'captcha.css'));
  });
  router.get('/captcha/new', (req, res, next) => {
    const id = shortid();
    const text = (() => {
      let ret = shortid();
      if (ret.length > 6) {
        ret = ret.substr(0, 6).toLowerCase();
      }
      return ret;
    })();
    const finalConfig = ctx.plugins[pluginID].config;
    finalConfig.text = text;
    finalConfig.size = text.length;
    return captcha(config)
      .then((result) => {
        return storage.setItem(`${ctx.plugins[pluginID].prefix}${id}`, {
            'src': result[1].toString('utf8'),
            'text': result[0].toString(),
            'timestamp': Date.now()
          })
          .then(() => {
            return res.redirect(`/captcha/${id}`);
          })
          .catch(function() {
            return next(...arguments);
          });
      })
      .catch(function() {
        return next(...arguments);
      });
  });
  router.get('/captcha/:id', (req, res, next) => {
    return storage.getItem(`${ctx.plugins[pluginID].prefix}${req.params.id}`)
      .then((result) => {
        res.writeHead(200, {
          'content-type': 'text/html'
        });
        return res.end(sprintf(templates.get('captcha'), req.params.id, result.src));
      }).catch(function() {
        return next(...arguments);
      });
  });
  router.post('/captcha/:id/solve', (req, res, next) => {
    const body = req.body;
    const id = req.params.id;
    if (body.solution === undefined) return next('Missing key: solution');
    return storage.getItem(`${ctx.plugins[pluginID].prefix}${id}`)
      .then((captcha) => {
        if (captcha.text === body.solution) {
          const otk = `${Date.now()}${shortid()}`;
          ctx.plugins[pluginID].otks.push(otk);
          res.end(JSON.stringify({
            'status': 'OK',
            'otk': `${otk}`
          }));
          return storage.removeItem(`${ctx.plugins[pluginID].prefix}${id}`);
        } else {
          return res.end(JSON.stringify({
            'status': 'fail',
            'error': 'Invalid Solution. Try again!'
          }));
        }
      })
      .catch(function() {
        return next(...arguments);
      });
  });
};

const captchaResourceLink = () => {
  return templates.get('captchaResourceLink');
};

const init = (ctx, storage) => {
  return templates.init(__dirname).then(() => {
    return new Promise(function(resolve, reject) {
      const pluginContext = {
        'config': config,
        'enabled': true,
        'prefix': `captcha-`,
        'otks': []
      };
      exports.useOTK = (req, res, next) => {
        if (ctx.plugins[pluginID].enabled) {
          if (ctx.plugins[pluginID].otks.indexOf(req.body.otk) > -1) {
            ctx.plugins[pluginID].otks.splice(req.body.otk, 1);
            delete req.body.otk;
            return next();
          } else {
            return next("You have not solved a captcha yet. Please try again.");
          }
        } else return next();
      };
      return resolve(pluginContext);
    });
  });
};

exports.captchaResourceLink = captchaResourceLink;
exports.routes = hookRoutes;
exports.init = init;
