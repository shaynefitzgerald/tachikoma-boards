const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const validator = require('validator');
const bodyParser = require('body-parser');
const tripcode = require('tripcode');
const storage = require('node-persist')
  .create({
    dir: path.join(__dirname, 'imageboard-persist'),
    stringify: JSON.stringify,
    parse: JSON.parse,
    encoding: 'utf8',
    logging: false,
    continuous: true,
  });
const removeRoute = require('express-remove-route');
const favicon = require('serve-favicon');
const sprintf = require('sprintf-js')
  .sprintf;
const shortid = require('shortid').generate;

const templates = require(path.join(__dirname, 'templateEngine.js'));
const parseTripcode = require(path.join(__dirname, 'parseTripcode.js'));

const MAX_SUBJECT_LENGTH = 140;
const MAX_TRIP_LENGTH = 32;
const MAX_EMAIL_LENGTH = 254;
const MAX_BODY_LENGTH = 6000;
const ERR_MESSAGE_LENGTH = 500;

let DEBUG = true;

const context = {
  boards: ['b', 'cyb', 'meta'],
  threads: {},
  posts: {},
  curPostNumber: 0,
  pluginManager: require(path.join(__dirname, 'plugins', 'pluginManager.js')),
  moderators: []
};

if (String.prototype.trimToLength === undefined) {
  String.prototype.trimToLength = function(max) {
    if (this.length < max) return this;
    else {
      return this.substr(0, max);
    }
  };
}

const _emitPostNumber = (ctx, storage) => {
  return new Promise(function(resolve, reject) {
    return storage.getItem('SYS')
      .then((res) => {
        const updatedPostCount = parseInt(res.postCount) + 1;
        res.postCount = updatedPostCount;
        return storage.setItem('SYS', res)
          .then(() => {
            ctx.curPostNumber = updatedPostCount;
            return resolve(updatedPostCount);
          })
          .catch(function() {
            return reject(...arguments);
          });
      })
      .catch(function() {
        return reject(...arguments);
      });
  });
};
const _generateTimestamp = () => {
  return Date.now();
};

const _cleanText = (text) => {
  text = text.toString();
  if (text.length > MAX_BODY_LENGTH) {
    text = text.substring(0, MAX_BODY_LENGTH);
  }
  let ret = validator.blacklist(validator.stripLow(validator.trim(validator.escape(text)), true), '\\{\\}\\[\\]');
  console.log(`Sanitized ${text} down to ${ret}`);
  return ret;
};
const _cleanEmail = (email) => {
  email = email.length > MAX_EMAIL_LENGTH ? email.substring(0, MAX_EMAIL_LENGTH) : email;
  return validator.escape(validator.stripLow(validator.trim(email)));
};
const _cleanSubject = (subject) => {
  subject = subject.length > MAX_SUBJECT_LENGTH ? subject.substring(0, MAX_SUBJECT_LENGTH) : subject;
  return validator.escape(validator.blacklist(validator.stripLow(validator.trim(subject)), '<>\\{\\}\\[\\]'));
};
const _contentValidator = (content) => {
  const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  const reqkeys = ['subject', 'email', 'content', 'trip'];
  const actualkeys = Object.keys(content);
  if (reqkeys.length !== actualkeys.length) {
    return [false, `Expected ${reqkeys.length} keys, got ${actualkeys.length}`];
  } else {
    for (let i = 0; i < actualkeys.length; i++)
      if (reqkeys.indexOf(actualkeys[i]) === -1) return [false, `Extraneous key ${actualkeys[i]}`];
    if (content.email.length !== 0 && !emailRegex.exec(content.email)) {
      return [false, `Invalid email: "${content.email}"`];
    }
    if (content.content.length > MAX_BODY_LENGTH) {
      return [false, `Content Length > MAX_BODY_LENGTH. Got: ${content.content.length}`];
    } else if (content.content.length === 0) {
      return [false, `Empty Content`];
    }
    return [true, content];
  }
};
const _cleanContent = (content) => {
  return {
    'subject': _cleanSubject(content.subject)
      .trimToLength(MAX_SUBJECT_LENGTH),
    'email': _cleanEmail(content.email)
      .trimToLength(MAX_EMAIL_LENGTH),
    'content': _cleanText(content.content)
      .trimToLength(MAX_BODY_LENGTH),
    'trip': content.trip
  };
};

const _linkPostToThread = (ctx, storage, postid, threadid) => {
  return new Promise(function(resolve, reject) {
    if (ctx.threads[`thread-${threadid}`].replies === undefined)
      ctx.threads[`thread-${threadid}`].replies = [`${postid}`];
    else
      ctx.threads[`thread-${threadid}`].replies.push(`${postid}`);
    return storage.setItem(`thread-${threadid}`, ctx.threads[`thread-${threadid}`])
      .then(() => {
        return resolve(postid);
      }).catch(function() {
        return reject(...arguments);
      });
  });
};
const _threadFactory = (ctx, storage, board, content) => {
  return new Promise(function(resolve, reject) {
    if (ctx.boards.indexOf(board) === -1) {
      return reject(`No such board: ${board}`);
    }
    const validContent = _contentValidator(content);
    if (validContent[0] !== false) {
      content = _cleanContent(content);
      return _emitPostNumber(ctx, storage)
        .then((postNumber) => {
          const timestamp = _generateTimestamp();
          content.postNumber = postNumber;
          content.timestamp = timestamp;
          if (content.trip !== '' || content.trip.length !== 0) {
            content.tripcode = parseTripcode(ctx, storage, content.trip);
            delete content.trip;
          }
          content.board = board;
          return storage.setItem(`thread-${postNumber}`, content)
            .then(() => {
              ctx.threads[`thread-${postNumber}`] = content;
              return resolve(postNumber);
            })
            .catch(e => {
              return reject(e);
            });
        })
        .catch(function() {
          return reject(...arguments);
        });
    } else {
      return reject(`Invalid content (${validContent[1]}). Discarding.`);
    }
  });

};
const _postFactory = (ctx, storage, thread, content) => {
  return new Promise(function(resolve, reject) {
    //console.log(Object.keys(ctx.threads));
    if (ctx.threads[`thread-${thread}`] === undefined) {
      return reject(`No such thread: thread-${thread}`);
    }
    const validContent = _contentValidator(content);
    if (validContent[0] !== false) {
      content = _cleanContent(content);
      return _emitPostNumber(ctx, storage)
        .then((postNumber) => {
          const timestamp = _generateTimestamp();
          content.postNumber = postNumber;
          content.timestamp = timestamp;
          if (content.trip !== '' || content.trip.length !== 0) {
            content.tripcode = parseTripcode(ctx, storage, content.trip);
            delete content.trip;
          }
          content.thread = thread;
          content.board = ctx.threads[`thread-${thread}`].board;
          return storage.setItem(`post-${postNumber}`, content)
            .then(() => {
              ctx.posts[`post-${postNumber}`] = content;
              return _linkPostToThread(ctx, storage, postNumber, thread)
                .then(function() {
                  return resolve(...arguments);
                })
                .catch(function() {
                  return reject(...arguments);
                });
            })
            .catch(e => {
              return reject(e);
            });
        });
    } else {
      return reject(`Invalid content (${validContent[1]}). Discarding.`);
    }
  });
};
const _pinPost = (ctx, storage, thread) => {
  ctx.threads[`thread-${thread}`].pinned = true;
  return storage.setItem(`thread-${thread}`, ctx.threads[`thread-${thread}`]);
};
const _matchTripCode = (ctx, thread, trip) => {
  return ctx.threads[`thread-${thread}`].tripcode === parseTripcode(trip);
};
const _lastTwentyPosts = (ctx, storage) => {
  return new Promise(function(resolve, reject) {
    try {
      const start = ctx.curPostNumber;
      const ret = [];
      for(let i = start; i > start - 20; i--){
          if(i <= 0) break; //there's no 0 index for posts.
          if(ctx.posts[`post-${i}`]){
            ret.push(ctx.posts[`post-${i}`]);
          } else if(ctx.threads[`thread-${i}`]) {
            ret.push(ctx.threads[`thread-${i}`]);
          }
      }
      return resolve(ret);
    } catch (e) {
      return resolve(e);
    }
  });
};
const _getStatistics = (ctx, storage) => {
  let ret = {
    'postCount': ctx.curPostNumber,
    'threads': ctx.threads.length
  };
  return ret;
};
const _triggerCleanup = (ctx, storage, board) => {
  return new Promise(function(resolve, reject) {
    const boardThreads = Object.keys(ctx.threads).filter((thread) => {
      return thread.board === board;
    }).map((elem) => {
      return ctx.threads[elem];
    });
    if (boardThreads.length === 0 || boardThreads.length === 1) return;
    if (boardThreads.length < MAX_THREAD_COUNT) return;
    let oldestThread = boardThreads[0];
    for (let i = 0; i < boardThreads.length; i++) {
      if (oldestThread.postNumber === boardThreads[i].postNumber) continue;
      else if (boardThreads[i].pinned === true) continue;
      let compTimestamp = ((ctx, thread) => {
        if (thread.replies === undefined) return thread.timestamp;
        else return ctx.posts[thread.replies[thread.replies.length - 1]].timestamp;
      })(ctx, boardThreads[i]);
      let curTimestamp = oldestThread.replies === undefined || oldestThread.replies.length === 0 ? oldestThread.timestamp : oldestThread.replies[oldestThread.replies - 1].timestamp;
      if (curTimestamp - compTimestamp >= 0) oldestThread = boardThreads[i];
    }
    return storage.removeItem(`thread-${oldestThread.postNumber}`)
      .then(() => {
        const operation = (post) => {
          return storage.removeItem(post)
            .then(() => {
              return new Promise(function(resolve, reject) {
                delete ctx.posts[`post-${post}`];
                return resolve();
              });

            });
        };
        let childPosts = ctx.threads[`thread-${oldestThread.postNumber}`].replies;
        return Promise.all(((childPosts) => {
          let ret = [];
          for (let i = 0; i < childPosts.length; i++) {
            ret.push(operation(post));
          }
          return ret;
        })(oldestThread.replies));
      })
      .then(() => {
        delete ctx.threads[`thread-${boardThreads.postNumber}`];
        return;
      });
  });
};
const _initSystemFiles = (ctx, storage) => {
  return new Promise(function(resolve, reject) {
    return storage.getItem('SYS').then((sys) => {
      if (sys === undefined) {
        sys = {
          'postCount': 0,
          'salt' : `${shortid()}${shortid()}${Date.now()}`
        };
        return storage.setItem('SYS', sys).then(() => {
          ctx.tripSalt = sys.salt;
          ctx.curPostNumber = sys.postCount;
          return resolve(ctx);
        }).catch(function() {
          return reject(...arguments);
        });
      } else {
        ctx.tripSalt = sys.salt;
        ctx.curPostNumber = sys.postCount;
        return resolve(ctx);
      }
    }).catch(function() {
      return reject(...arguments);
    });
  });
};

const loadThreads = (ctx, storage) => {

  return new Promise(function(resolve, reject) {
    const keys = storage.keys();
    const threadRegex = /thread-([0-9]+)/;
    const postRegex = /post-([0-9]+)/;
    const threads = keys.filter((elem) => {
      return threadRegex.exec(elem);
    });
    const posts = keys.filter((elem) => {
      return postRegex.exec(elem);
    });
    console.log(`beginning load of ${threads.length} threads, and ${posts.length} posts.`);
    const threadOperation = (thread) => {
      return new Promise(function(resolve, reject) {
        return storage.getItem(thread)
          .then((threadBody) => {
            return resolve(threadBody);
          })
          .catch(function() {
            return next(...arguments);
          });
      });
    };
    const postOperation = (post) => {
      return new Promise(function(resolve, reject) {
        return storage.getItem(post)
          .then((postBody) => {
            return resolve(postBody);
          })
          .catch(function() {
            return next(...arguments);
          });
      });
    };
    return Promise.all(((threadList, postList) => {
        return [
          Promise.all((() => {
            let ret = [];
            for (let i = 0; i < threadList.length; i++)
              ret.push(threadOperation(threadList[i]));
            return ret;
          })(threadList)),
          Promise.all((() => {
            let ret = [];
            for (let i = 0; i < postList.length; i++)
              ret.push(postOperation(postList[i]));
            return ret;
          })(postList))
        ];
      })(threads, posts))
      .then((results) => {
        const threads = results[0];
        const posts = results[1];
        for (let i = 0; i < threads.length; i++) {
          const thread = threads[i];
          ctx.threads[`thread-${thread.postNumber}`] = thread;
        }
        for (let i = 0; i < posts.length; i++) {
          const post = posts[i];
          ctx.posts[`post-${post.postNumber}`] = post;
        }
        console.log(`Loaded ${Object.keys(ctx.threads).length} threads and ${Object.keys(ctx.posts).length} posts.`);
        return resolve(ctx);
      })
      .catch(function() {
        return reject(...arguments);
      });
  });
};
const initRoutes = (ctx, storage, router) => {
  return new Promise(function(resolve, reject) {
    router.use(favicon(path.join(__dirname, 'res','favicon.ico')));
    router.param('board', function(req, res, next, board) {
      const boardRegex = /([a-z]{1,3})/;
      if (!boardRegex.exec(board) && ctx.boards.indexOf(board) !== -1)
        req.params.board = board;
      return next();
    });
    router.param('thread', (req, res, next, thread) => {
      const threadRegex = /([0-9]{1,})/;
      if (!threadRegex.exec(thread)) return next(`Invalid thread ID format: ${thread}`);
      if (Object.keys(ctx.threads)
        .indexOf(`thread-${thread}`) === -1) return next(`No such thread: ${thread}`);
      req.params.thread = thread;
      return next();
    });
    router.param('post', (req, res, next, post) => {
      const postRegex = /([0-9]{1,})/;
      if (!postRegex.exec(post)) return next(`Invalid post ID format: ${post}`);
      if (Object.keys(ctx.posts)
        .indexOf(`post-${post}`) === -1) return next(`No such post: ${post}`);
      req.params.post = post;
      return next();
    });

    router.get('/res/:board/*', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      const validFiles = /([a-zA-z-_.0-9]{1,32})\.(css|jpg|png|js|tff)/;
      const upDir = /\.\.\//;
      const fileName = req.params[0];
      const failString = `Invalid resource path: /${req.params.board}/res/${fileName}`;
      if (upDir.exec(fileName)) return next(failString);
      else if (!validFiles.exec(fileName)) return next(failString);
      return res.sendFile(fileName, {
        'root': path.join(__dirname, 'res',
          `${req.params.board}`)
      });
    });
    router.get('/res/*', (req, res, next) => {
      const validFiles = /([a-zA-z-_.0-9]{1,32})\.(css|jpg|png|js|tff)/;
      const upDir = /\.\.\//;
      const fileName = req.params[0];
      const failString = `Invalid resource path: /res/${fileName}`;
      if (upDir.exec(fileName)) return next(failString);
      else if (!validFiles.exec(fileName)) return next(failString);
      return res.sendFile(fileName, {
        'root': path.join(__dirname, 'res')
      });
    });

    ctx.pluginManager.loadPluginRoutes(ctx, storage, router);

    router.get('/', (req, res, next) => {
      const stats = _getStatistics(ctx, storage);
      res.writeHead(200, {
        'content-type': 'text/html'
      });
      const templateInjection = ctx.pluginManager.getTemplateInjectionForRoute(ctx, 'get', '/');
      return res.end(sprintf(templates.get('index'), templateInjection));
    });
    router.get('/source.json', (req, res, next) => {
      return _lastTwentyPosts(ctx, storage)
        .then((posts) => {
          res.writeHead(200, {
            'content-type' : 'application/json'
          });
          return res.end(JSON.stringify({
            'posts': posts
          }));
        })
        .catch((error) => {
          return next(error);
        });
    });
    router.get('/header', (req, res) => {
      res.writeHead(200, {
        'content-type': 'text/html'
      });
      return res.end(sprintf(templates.get('header'), '', ctx.boards));
    });
    router.get('/footer', (req, res) => {
      res.writeHead(200, {
        'content-type': 'text/html'
      });
      return res.end(sprintf(templates.get('footer'), '', ctx.boards));
    });
    router.get('/:board/source.json', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      const threads = ((board) => {
        let ret = [];
        const threads = Object.keys(ctx.threads)
          .filter((elem) => {
            return ctx.threads[elem].board === board;
          })
          .sort((a, b) => {
            return ctx.threads[a].timestamp - ctx.threads[b].timestamp;
          });
        for (let i in threads) {
          ret.push(ctx.threads[threads[i]]);
        }
        return ret;
      })(req.params.board);
      return res.end(JSON.stringify(threads));
    });
    router.get('/:board', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      res.writeHead(200, {
        'content-type': 'text/html'
      });
      const templateInjection = ctx.pluginManager.getTemplateInjectionForRoute(ctx, 'get', '/:board');
      return res.end(sprintf(templates.get('board'), templateInjection, req.params.board));
    });
    router.get('/:board/header', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      res.writeHead(200, {
        'content-type': 'text/html'
      });
      return res.end(sprintf(templates.get('header'), req.params.board, ctx.boards));
    });
    router.get('/:board/footer', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      res.writeHead(200, {
        'content-type': 'text/html'
      });
      return res.end(sprintf(templates.get('footer'), req.params.board, ctx.boards));
    });
    router.get('/:board/:thread/source.json', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      try {
        const threadOP = ctx.threads[`thread-${req.params.thread}`];
        let threadReplies = [];
        if (threadOP.replies !== undefined)
          threadReplies = ((replyIDs) => {
            let ret = [];
            for (let i = 0; i < replyIDs.length; i++) {
              ret.push(ctx.posts[`post-${replyIDs[i]}`]);
            }
            return ret;
          })(threadOP.replies);
        res.writeHead(200, {
          'content-type': 'application/json'
        });
        return res.end(JSON.stringify({
          'op': threadOP,
          'replies': threadReplies
        }));
      } catch (e) {
        return next(e);
      }
    });
    router.get('/:board/:thread/', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      res.writeHead(200, {
        'content-type': 'text/html'
      });
      const templateInjection = ctx.pluginManager.getTemplateInjectionForRoute(ctx, 'get', '/:board/:thread');
      return res.end(sprintf(templates.get('thread'), templateInjection, req.params.board, req.params.thread));
    });
    router.post('/:board/new', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      const board = req.params.board;
      const body = req.body;
      return _threadFactory(ctx, storage, board, body)
        .then((threadNumber) => {
          return ctx.pluginManager.doPostSubmitActions(ctx, storage, req, 'thread', threadNumber);
        })
        .then((threadNumber) => {
          _triggerCleanup(ctx, storage, board)
            .catch(function() {
              console.log(`failed to prune oldest thread on board: ${board}`);
              console.log(...arguments);
            });
          return res.redirect(`/${board}/${threadNumber}/`);
        })
        .catch(function() {
          return next(...arguments);
        });
    });
    router.post('/:board/:thread/reply', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      const body = req.body;
      return _postFactory(ctx, storage, req.params.thread, body)
        .then((postNumber) => {
          return ctx.pluginManager.doPostSubmitActions(ctx, storage, req, 'post', postNumber);
        })
        .then((postNumber) => {
          return res.redirect(`/${req.params.board}/${req.params.thread}/#${postNumber}`);
        })
        .catch(e => {
          return next(e);
        });
    });
    router.post('/:board/:thread/pin', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      const trip = parseTripcode(ctx, storage, req.body.tripcode);
      if (trip === undefined || ctx.moderators.indexOf(trip) === -1)
        return res.redirect(`/${req.params.board}/${req.params.thread}/`);
      else {
        return _pinPost(ctx, storage, req.params.thread)
          .then(() => {
            return res.redirect(`/${req.params.board}/${req.params.thread}/?pinned=1`);
          })
          .catch(function() {
            return next(...arguments);
          });
      }
    });
    router.post('/:board/:thread/delete', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      const trip = parseTripcode(req.body.tripcode);
      if (trip === undefined || ctx.moderators.indexOf(trip) === -1 || !_matchTripCode(ctx, req.params.thread, trip))
        return res.redirect(`/${req.params.board}/${req.params.thread}/`);
      else {
        return new Promise(function(resolve, reject) {
            const replies = ctx.threads[req.params.thread].replies;
            return storage.removeItem(req.params.thread)
              .then(() => {
                const operation = (post) => {
                  return new Promise(function(resolve, reject) {
                    return storage.remoteItem(post)
                      .then(() => {
                        delete ctx.posts[post];
                      })
                      .catch(function() {
                        return next(...arguments);
                      });
                  });
                };
                return Promise.all(((posts) => {
                  let ret = [];
                  for (let i = 0; i < posts.length; i++) {
                    ret.push(operation(posts[i]));
                  }
                  return ret;
                })(replies));
              });
          })
          .then(() => {
            delete ctx.threads[req.params.thread];
            return res.redirect(`/${req.params.board}/`);
          })
          .catch(function() {
            return next(...arguments);
          });
      }
    });
    router.post('/:board/:thread/:post/delete', (req, res, next) => {
      if (req.params.board === undefined || ctx.boards.indexOf(req.params.board) === -1)
        return next(`Invalid board id. ${req.params.board} in ${req.route.path}`);
      const trip = parseTripcode(req.body.tripcode);
      if (trip === undefined || ctx.moderators.indexOf(trip) === -1 || !_matchTripCode(ctx, req.params.thread, trip))
        return res.redirect(`/${req.params.board}/${req.params.thread}/`);
      else {
        return storage.removeItem(`post-${req.params.board}`)
          .then(storage.getItem(`thread-${req.params.thread}`))
          .then((thread) => {
            thread.posts.splice(thread.posts.indexOf(req.params.post), 1);
            ctx.threads[`thread-${req.params.thread}`] = thread;
            return storage.setItem(`thread-${req.params.thread}`, thread);
          })
          .then(() => {
            return res.redirect(`/${req.params.board}/${req.params.thread}/`);
          })
          .catch(function() {
            return next(...arguments);
          });
      }
    });

    router.use((err, req, res, next) => {
      console.log(err);
      res.writeHead(500, {
        'content-type': 'text/html'
      });
      let errmsg;
      if (err.message !== undefined)
        errmsg = err.message;
      else errmsg = err;
      return res.end(sprintf(templates.get('error'),
       validator.escape(errmsg.trimToLength(ERR_MESSAGE_LENGTH))));
    });

    return resolve(router);
  });
};

const init = (app, routePrefix) => {
  return new Promise(function(resolve, reject) {
    console.log("Initializing Storage Driver");
    return storage.init()
      .then(() => {
        console.log("Loading Template Engine");
        return templates.init(__dirname);
      })
      .then(() => {
        console.log("Plugin Manager Init...");
        return context.pluginManager.init(context, storage);
      })
      .then((ctx) => {
        console.log("Discovering Plugins...");
        return ctx.pluginManager.discoverPlugins(ctx, storage);
      })
      .then((ctx) => {
        console.log("Loading Discovered Plugins...");
        return ctx.pluginManager.loadPlugins(ctx, storage);
      })
      .then((ctx) => {
        console.log("Initializing SYS record...");
        return _initSystemFiles(ctx, storage);
      })
      .then((ctx) => {
        console.log("Running Plugin Context Modifiers...");
        return ctx.pluginManager.loadContextModifiers(ctx, storage);
      })
      .then((ctx) => {
        console.log("Loading Threads from Disk...");
        return loadThreads(ctx, storage);
      })
      .then(function(ctx) {
        console.log("Overloading Router methods...");
        return ctx.pluginManager.createOverloadedRouter(ctx, storage);
      })
      .then(function(args) {
        console.log("Initializing Routes...");
        return initRoutes(args[0], storage, args[1]);
      })
      .then((router) => {
        console.log("Linking router to application...");

        if (routePrefix === undefined || routePrefix === '')
          app.use(router);
        else
          app.use(routePrefix, router);
        console.log("Done.");
        return resolve(app);
      })
      .catch(function() {
        return reject(...arguments);
      });
  });
};

exports.init = init;
exports.initRoutes = initRoutes;
