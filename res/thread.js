const fmtOP = (op) => {
  const opTemplate = $('div.op-box.template').clone(true, true);
  const keys = Object.keys(op);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === 'content') {
      opTemplate.find(`.op-body-content`).html(op.content.replaceAll("\r\n", "<br />").replaceAll("\n", "<br />"));
    } else if (keys[i] === 'timestamp') {
      opTemplate.find(`.op-header-timestamp`).text(new Date(op.timestamp).toGMTString());
    } else if (keys[i] === 'postNumber') {
      opTemplate.find(`.op-header-postNumber`).text(`Post #${op.postNumber}`);
    } else if (keys[i] === 'tripcode') {
      const tripcodeText = op.tripcode === "" ? 'OP' : op.tripcode;
      opTemplate.find(`.op-header-trip`).text(tripcodeText);
    } else {
      opTemplate.find(`.op-header-${keys[i]}`).text(op[keys[i]]);
    }
  }
  if (op.tripcode === undefined) {
   opTemplate.find(`.op-header-trip`).text('Anonymous');
 }
  opTemplate.removeClass('template');
  return opTemplate;
};
const fmtPost = (post) => {
  //console.log(post);
  const postTemplate = $('div.post-box-wrapper.template').clone(true, true);
  const keys = Object.keys(post);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === 'content') {
      postTemplate.find(`.post-box-content`).html(post.content.replaceAll("\r\n", "<br />").replaceAll("\n", "<br />"));
    } else if (keys[i] === 'timestamp') {
      postTemplate.find(`.post-header-timestamp`).text(new Date(post.timestamp).toGMTString());
    } else if (keys[i] === 'postNumber') {
      postTemplate.find(`.post-header-postNumber`).text(`Post #${post.postNumber}`);
    } else if (keys[i] === 'tripcode') {
      const tripcodeText = post.tripcode === undefined ? 'Anonymous' : post.tripcode;
      postTemplate.find(`.post-header-trip`).text(tripcodeText);
    } else if(keys[i] ==='subject') {
      postTemplate.find(`.post-header-subject`).html(post.subject);
    } else {
      postTemplate.find(`.post-header-${keys[i]}`).text(post[keys[i]]);
    }
  }
  if (post.tripcode === undefined) {
   postTemplate.find(`.post-header-trip`).text('Anonymous');
 }
  postTemplate.removeClass('template');
  return postTemplate;
};

const displayJSONSource = (source) => {
  return new Promise(function(resolve, reject) {
    try {
      const op = source.op;
      const replies = source.replies;
      $('div.op-anchor').append(fmtOP(op));
      for (let i = 0; i < replies.length; i++) {
        $('.site-body').append(fmtPost(replies[i]));
      }
      return resolve();
    } catch (e) {
      return reject(e);
    }
  });
};
const requestThreadSource = () => {
  return new Promise(function(resolve, reject) {
    const board = $('div.location-anchor').data('board');
    const thread = $('div.location-anchor').data('thread');
    $.ajax(`/${board}/${thread}/source.json`).then((result) => {
      return resolve(result);
    }).catch(e => reject(e));
  });
};

const hideOtherControlMenus = (next) => {
  //TODO: implement
};
const referenceInReply = (postNumber) => {
  const contentBox = $('.reply-box');
  contentBox.val(`${contentBox.val()} >>${postNumber}`);
};
const initThreadTemplates = (board, thread) => {
  $('.post-header-postNumber').click((evt) => {
    return referenceInReply($(evt.target).text());
  });
  $('.op-header-postNumber').click((evt) => {
    return referenceInReply($(evt.target).text());
  });
  $('.post-header-threadcontrols').click((evt) => {
    const menu = $(evt.target).children('div.control-wrapper');
    if ((menu).is(':hidden')) {
      hideOtherControlMenus(menu);
      menu.show();
    } else {
      menu.hide();
    }
  });
  $('.delete-post').click((evt) => {
    const postNumber = $(evt.target)
      .parents('post-box-header')
      .children('post-header-postNumber').text();
    const tripcode = $(evt.target).parent().children('input.mod-control-tripcode').val();
    if (tripcode.length === 0 || tripcode === "Tripcode") {
      return displayErrors('Enter your tripcode');
    } else {
      const form = $(evt.target).parent();
      form.append(`<input hidden='true' name='postNumber'>${postNumber}</input>`);
      form.attr('action', `/${board}/${thread}/${postNumber}/delete`);
      form.submit();
    }
  });
  $('.delete-thread').click((evt) => {
    const tripcode = $(evt.target).parent().children('input.mod-control-tripcode').val();
    if (tripcode.length === 0 || tripcode === "Tripcode") {
      return displayErrors('Enter your tripcode');
    } else {
      const form = $(evt.target).parent();
      form.attr('action', `/${board}/${thread}/delete`);
      form.submit();
    }
  });
  $('.pin-thread').click((evt) => {
    const tripcode = $(evt.target).parent().children('input.mod-control-tripcode').val();
    if (tripcode.length === 0 || tripcode === "Tripcode") {
      return displayErrors('Enter your tripcode');
    } else {
      const form = $(evt.target).parent();
      form.attr('action', `/${board}/${thread}/pin`);
      form.submit();
    }
  });
};

$(document).ready(() => {
  return removeES6Warning()
    .then(initPage)
    .then(initThreadTemplates)
    .then(preLoad)
    .then(requestThreadSource)
    .then(displayJSONSource)
    .then(loadingComplete)
    .catch(e => displayErrors(e));
});
