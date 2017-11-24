const fs = require('fs');
const path = require('path');

const watcher = require('filewatcher')({
  persistent: false
});

const sources = {};

const get = (template) => { return sources[template]; };

const list = () => { return Object.keys(sources); };

const init = (rootDirectory) => {
  return new Promise(function(resolve, reject) {
    let templateNames = fs.readdirSync(path.join(rootDirectory, 'templates'))
      .filter((f) => {
        return '.html' === path.extname(path.basename(f));
      });
    templateNames.forEach((e, i, arr) => {
      arr[i] = path.basename(e, '.html');
    });

    const templatePath = (n) => {
      return path.join(rootDirectory, 'templates', n.concat('.html'));
    };

    try {
      for (let i in templateNames) {
        sources[templateNames[i]] = fs.readFileSync(templatePath(templateNames[i]), 'utf8')
          .toString();
        watcher.add(templatePath(templateNames[i]));
      }
    } catch (e) {
      return reject(e);
    }
    watcher.on('change', (f, stat) => {
      const name = (p) => {
        return path.basename(p, '.html');
      };
      console.log(`change on file: ${f}`);
      return fs.readFile(f, (err, res) => {
        if (err) {
          console.log(err.toString());
        } else {
          console.log(`reloading file: ${f} (${name(f)})`);
          sources[name(f)] = res.toString();
        }
      });
    });
    return resolve();
  });
};

exports.get = get;
exports.list = list;
exports.init = init;
