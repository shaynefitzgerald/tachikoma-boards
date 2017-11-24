This program is provided AS IS, in it's current beta state. 

Some plugins are missing that are live on the site, notably mod tools. This is mostly due to either incomplete code or security concerns.
However the board is completely usable without them.

You can run the boards locally with NodeJS installed with npm, and python for node-gyp to compile canvas:

$ npm install
$ npm test

If you don't want to install python/compile canvas, delete /plugins/tachiplugin-captcha, and remove the dependency in package.json

Please feel free to critique, make improvements, or hack away at the code.
