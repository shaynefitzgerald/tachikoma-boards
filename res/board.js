const PREVIEW_LENGTH = 250;



const initBoardTemplates = () => {
  return new Promise(function(resolve, reject) {
    $('.thread-preview').click((evt) => {
      evt.stopPropagation();
      const target = $(evt.target);
      let thread;
      if(target.hasClass('.thread-preview'))
        thread = target.find('span.thread-preview-thread').text();
      else {
        thread = target.closest('.thread-preview').
        find('span.thread-preview-thread').text();
      }
      const board = $('.location-anchor').data('board');
      window.location.href = `/${board}/${thread}/`;
    });
    return resolve();
  });
};
const loadBoardIndex = () => {
  const board = $('.location-anchor').data('board');
  return new Promise(function(resolve, reject) {
    return $.ajax(`/${board}/source.json`).then((result) => {
      try {
        return resolve(JSON.parse(result));
      } catch (e) {
        return reject(e);
      }
    }).catch(function() {
      return reject(...arguments);
    });
  });
};
const displayBoardThreads = (threads) => {
  threads.sort((a,b) => { return a.timestamp - b.timestamp; });
  const board = $('.location-anchor').data('board');
  const rowLength = (() => {
    if(threads.length === 1) return 2;
    if(threads.length > 3) return 3;
    return threads.length;
  })();
  const className = `pure-u-1-${rowLength}`;
  return new Promise(function(resolve, reject) {
    try {
      if (threads.length !== 0) {
        for (let idx in threads) {
          const template = $('.thread-preview-wrapper.template').clone(true, true);
          template.find('span.thread-preview-thread').text(threads[idx].postNumber);
          template.find('.thread-preview-tripcode').text(threads[idx].tripcode);
          const dateString = (new Date(threads[idx].timestamp)).toGMTString();
          template.find('.thread-preview-timestamp').text(dateString);
          if (threads[idx].subject !== '')
            template.find('.thread-preview-subject').text(threads[idx].subject);
          else
            template.find('.thread-preview-subject-wrapper').remove();
          const content = threads[idx].content
          .trimToLength(PREVIEW_LENGTH)
          .replaceAll("\r\n", "<br />")
          .replaceAll("\n", "<br />");
          template.find('.thread-preview-content').html(content);
          const threadReplies = threads[idx].replies === undefined ? 0 : threads[idx].replies.length;
          template.find('span.thread-preview-replies').text(threadReplies);
          template.addClass(className);
          template.removeClass('template');
          $('.site-body').append(template);
        }
      } else {
        const template = $('.empty-board.template').clone(true, true);
        template.removeClass('template');
        $('.site-body').append(template);
      }
    } catch (e) {
      console.error(e);
      return reject(e);
    }
    return resolve();
  });
};

$(document).ready(() => {
  return initPage()
    .then(initBoardTemplates)
    .then(loadBoardIndex)
    .then(displayBoardThreads)
    .then(loadingComplete)
    .catch(function() {
      return displayErrors(...arguments);
    });
});
