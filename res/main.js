if (String.prototype.trimToLength === undefined) {
  String.prototype.trimToLength = function(max) {
    if (this.length < max) return this;
    else {
      return this.substr(0, max);
    }
  };
}
if (String.prototype.replaceAll === undefined) {
  String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
  };
}
const preloadCallbacks = [];
const loadingCompleteCallbacks = [];
const addPreLoadCallback = (generator) => {
  if(typeof generator === 'function'){
    preloadCallbacks.push(generator);
  }
};
const addLoadingCompleteCallback = (generator) => {
  if(typeof generator === 'function'){
    loadingCompleteCallbacks.push(generator);
  }
};
const preLoad = () => {
  return Promise.all(((cb) => {
    let ret = [];
    for(let i = 0; i < cb.length; i++){
      ret.push(cb[i]());
    }
    return ret;
  })(preloadCallbacks));
};
const loadingComplete = () => {
  return Promise.all(((cb) => {
    let ret = [];
    for(let i = 0; i < cb.length; i++){
      ret.push(cb[i]());
    }
    return ret;
  })(loadingCompleteCallbacks));
};

const pageLocation = () => {
  if ($('.index-panel').length !== 0) {
   return 'index';
 }
  const locationAnchor = $('.location-anchor');
  if(locationAnchor.length === 0){
    return 'other';
  } else if (locationAnchor.attr('data-board') !== undefined) {
    if (locationAnchor.attr('data-thread') !== undefined) {
      return 'thread';
    } else {
      return 'board';
    }
  }
};

const removeES6Warning = () => {
  return new Promise(function(resolve, reject) {
    $('.es6-warning').remove();
    return resolve();
  });
};
const getCurrentBoard = () => {
  const locarr = window.location.pathname.toString().split('/');
  if (locarr.length === 1 || locarr[1].length === 0) {
    return -1; //we're at the index
  } else {
    return locarr[1]; //board id.
  }
};
const displayErrors = (errorObject) => {
  const errmsg = typeof errorObject === "string" ? errorObject : errorObject.message;
  $('.error-banner-text').text(errmsg);
  $('.error-banner-wrapper').attr('hidden', false);
};
const initErrorBanner = () => {
  return new Promise(function(resolve, reject) {
    try {
      $('.error-banner-exit').click((evt) => {
        evt.preventDefault();
        $('.error-banner-wrapper').hide();
      });
    } catch (e) {
      return reject(e);
    }
    return resolve();
  });
};
const loadHeader = () => {
  const location = pageLocation();
  if (location === 'index' || location === 'other')
    return $.ajax(`/header`).then((header) => {
      $('.site-header').append(header);
    });
  else if(location === 'board' || location === 'thread'){
    const board = getCurrentBoard();
    return $.ajax(`/${board}/header`).then((header) => {
      $('.site-header').append(header);
    });
  } else {
    return new Promise(function(resolve, reject) {
      reject('No Header defined for current location.');
    });
  }
};
const loadFooter = () => {
  const location = pageLocation();
  if (location === 'index' || location === 'other')
    return $.ajax(`/footer`).then((footer) => {
      $('.site-footer').append(footer);
    });
  else if (location === 'board' || location === 'thread'){
    const board = getCurrentBoard();
    return $.ajax(`/${board}/footer`).then((footer) => {
      $('.site-footer').append(footer);
    });
  } else {
    return new Promise(function(resolve, reject) {
      reject('No Footer defined for current location.');
    });
  }
};
const initPage = () => {
  return Promise.all([initErrorBanner(), loadHeader(), loadFooter()]);
};
