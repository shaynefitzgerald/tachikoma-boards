const fs = require('fs');
const path = require('path');

const express = require('express');

const getMiddlewareForRoute = (ctx, provider, method, route) => {
  return ctx.plugins[provider]._.middleware.filter((ref) => {
    if (ref.explicit) {
      return ref.route === route && ref.method === method;
    } else if (ref.route === '*') {
      return ref.method === method;
    } else {
      return (new RegExp(ref.route))
        .exec(ref.route) && ref.method === method;
    }
  });
};
const getGlobalMiddleware = (ctx, provider) => {
  return ctx.plugins[provider]._.middleware.filter((ref) => {
    return ref.route === '*';
  });
};

const getProviders = (ctx, aspect) => {
  const pluginNames = Object.keys(ctx.plugins);
  pluginNames.splice(pluginNames.indexOf('_'), 1);
  return pluginNames.filter((elem) => {
    return ctx.plugins[elem]._.provides.indexOf(aspect) !== -1;
  });
};
const resolveDependencies = (ctx, plugins) => {
  return new Promise(function(resolve, reject) {
    try {
      const rankings = {};
      const need = [];
      for (let i = 0; i < plugins.length; i++) {
        const pluginID = plugins[i];
        rankings[pluginID] = 1;
        if (need.indexOf(pluginID) !== -1) {
          need.splice(need.indexOf(pluginID), 1);
        }
        const deps = ctx.plugins[pluginID]._.pluginDependencies;
        if (deps.length !== 0) {
          for (let j = 0; j < deps.length; j++) {
            if (rankings[deps[j]] !== undefined) {
              rankings[deps[j]]++;
            } else if (need.indexOf(deps[j]) === -1) {
              need.push(deps[j]);
            }
          }
        }
      }
      //console.log(`final rankings: ${JSON.stringify(rankings)}`);
      if (need.length !== 0) return reject(`Unresolved dependency during loading: ${JSON.stringify(need)}`);
      ctx.plugins._.loadOrder = Object.keys(rankings)
        .sort((a, b) => {
          if (rankings[a] > rankings[b]) return -1;
          else if (rankings[a] < rankings[b]) return 1;
          else if (rankings[a] === rankings[b]) return 0;
        }).reverse();
      //console.log(`sorted load order: ${JSON.stringify(ctx.plugins._.loadOrder)}`);
      return resolve(ctx);
    } catch (e) {
      return reject(e);
    }
  });
};
const discoverPlugins = (ctx, storage) => {
  return new Promise(function(resolve, reject) {
      return fs.readdir(path.join(__dirname), (err, files) => {
        if (err) return reject(err);
        const ret = [];
        const pluginFolderRegex = /tachiplugin-([a-z])(-[a-z]){0,1}/;
        for (let i = 0; i < files.length; i++) {
          if (files[i].indexOf('.js') !== -1) continue;
          if (pluginFolderRegex.test(files[i])) {
            ret.push(files[i]);
          }
        }
        return resolve(ret);
      });
    })
    .then((pluginPaths) => {
      const enumerate = (plugin) => {
        return new Promise(function(resolve, reject) {
          return fs.readFile(path.join(__dirname, plugin, 'plugin.json'), (err, buf) => {
            if (err) return reject(err);
            try {
              const conf = JSON.parse(buf.toString('utf8'));
              const pluginID = `${conf.name}:${conf.version}`;
              ctx.plugins[pluginID] = {};
              ctx.plugins[pluginID]._ = conf;
              return resolve(pluginID);
            } catch (e) {
              return reject(e);
            }
          });
        });
      };
      return Promise.all(pluginPaths.map(enumerate));
    })
    .then((plugins) => {
      return resolveDependencies(ctx, plugins);
    })
    .then((ctx) => {
      return ctx;
    });
};
const loadPlugins = (ctx, storage) => {
  const loadOperation = (pluginID) => {
    return new Promise(function(resolve, reject) {
      try {
        const plugin = require(path.join(__dirname, `tachiplugin-${pluginID.split(':')[0]}`, 'main.js'));
        return plugin.init(ctx, storage)
          .then((pluginContext) => {
            ctx.plugins[pluginID]._.pluginID = pluginID;
            ctx.plugins[pluginID]._.instance = plugin;
            return resolve([pluginID, pluginContext]);
          })
          .catch(function() {
            return reject(...arguments);
          });
      } catch (e) {
        return reject(e);
      }
    });
  };

  return Promise.all(Object.keys(ctx.plugins)
      .filter((e) => {
        return e !== '_';
      })
      .map(loadOperation))
    .then((plugins) => {
      //console.log(plugins);
      return new Promise(function(resolve, reject) {
        for (let i = 0; i < plugins.length; i++) {
          const cur = ctx.plugins[plugins[i][0]]._;
          ctx.plugins[plugins[i][0]] = plugins[i][1];
          ctx.plugins[plugins[i][0]]._ = cur;
        }
        //console.log(ctx);
        return resolve(ctx);
      });
    });
};
const createOverloadedRouter = (ctx, storage) => {
  return new Promise(function(resolve, reject) {
    try {
      const router = new express.Router();
      router._get = router.get;
      router._post = router.post;
      const mwProviders = getProviders(ctx, 'middleware');
      router.get = function() {
        const args = [...arguments];
        if (args.length < 2) throw new Error("Invalid argument length for router.get");
        const route = args[0];
        const handler = args[args.length - 1];
        const mw = [];
        for (let i = 0; i < mwProviders.length; i++) {
          const provider = mwProviders[i];
          const middlewareReferences = getMiddlewareForRoute(ctx, provider, 'get', route);
          for (let j = 0; j < middlewareReferences.length; j++) {
            const mwFunc = ctx.plugins[provider]._.instance[middlewareReferences[j].function];
            if (middlewareReferences[j].important === true) {
              mw.unshift(mwFunc);
            } else {
              mw.push(mwFunc);
            }
          }
        }
        const composite = [].concat(mw);
        return router._get(route, ...composite, handler);
      };
      router.post = function() {
        const args = [...arguments];
        if (args.length < 2) throw new Error("Invalid argument length for router.get");
        const route = args[0];
        const handler = args[args.length - 1];
        const mw = [];
        for (let i = 0; i < mwProviders.length; i++) {
          const provider = mwProviders[i];
          const middlewareReferences = getMiddlewareForRoute(ctx, provider, 'post', route);
          for (let j = 0; j < middlewareReferences.length; j++) {
            const mwFunc = ctx.plugins[provider]._.instance[middlewareReferences[j].function];
            if (middlewareReferences[j].important === true) {
              mw.unshift(mwFunc);
            } else {
              mw.push(mwFunc);
            }

          }
        }
        const composite = [].concat(mw);
        return router._post(route, ...composite, handler);
      };
      return resolve([ctx, router]);
    } catch (e) {
      return reject(e);
    }
  });

};
const loadPluginRoutes = (ctx, storage, router) => {
  const providers = getProviders(ctx, 'routes');
  return providers.forEach((provider) => {
    ctx.plugins[provider]._.instance.routes(ctx, storage, router);
  });
};
const getTemplateInjectionForRoute = (ctx, method, route) => {
  const providers = getProviders(ctx, 'templateInjection');
  const ret = [];
  const filterOperation = (ref) => {
    if (ref.explicit) {
      return ref.route === route && ref.method === method;
    } else if (ref.route === '*') {
      return ref.method === 'method';
    } else {
      return (new RegExp(ref.route)).exec(ref.route) && ref.method === method;
    }
  };
  const conversionOperation = (provider) =>{
    return (ref) => {
      return ctx.plugins[provider]._.instance[ref.function]();
    };
  };

  for (let i = 0; i < providers.length; i++) {
    ret.push(ctx.plugins[providers[i]]._.templateInjection
      .filter(filterOperation)
      .map(conversionOperation(providers[i]))
      .join('\n'));
  }
  return ret.join('\n');
};
const loadContextModifiers = (ctx, storage) => {
  return new Promise(function(resolve, reject) {
    const providers = getProviders(ctx, 'context');
    for(let i = 0; i < providers.length; i++){
      ctx = ctx.plugins[providers[i]]._.instance.context(ctx, storage);
    }
     return resolve(ctx);
  });
};
const doPostSubmitActions = (ctx, storage, request, type, id) => {
  return new Promise(function(resolve, reject) {
    const providers = getProviders(ctx, 'postSubmitAction');
    const operation = (ref) => {
      return ctx.plugins[ref]._.instance.postSubmitAction(ctx, storage, request, type, id);
    };
    return Promise.all(((refs) => {
      let ret = [];
      for(let i = 0; i < refs.length; i++){
        ret.push(operation(refs[i]));
      }
      return ret;
    })(providers))
    .then(() => {
      return resolve(id);
    })
    .catch(function(){
      return reject(...arguments);
    });
  });
};

const init = (ctx, storage) => {
  return new Promise(function(resolve, reject) {
    ctx.plugins = {};
    ctx.plugins._ = {};
    return resolve(ctx, storage);
  });
};

exports.doPostSubmitActions = doPostSubmitActions;
exports.loadContextModifiers = loadContextModifiers;
exports.resolveDependencies = resolveDependencies;
exports.discoverPlugins = discoverPlugins;
exports.loadPlugins = loadPlugins;
exports.createOverloadedRouter = createOverloadedRouter;
exports.getTemplateInjectionForRoute = getTemplateInjectionForRoute;
exports.loadPluginRoutes = loadPluginRoutes;
exports.init = init;
