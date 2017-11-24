const initPreviewLinks = () => {
  return new Promise(function(resolve, reject) {
    $('.post-preview').click((evt) => {
      evt.stopPropagation();
      const target = $(evt.target);
      window.location.href = target.closest('.post-preview').find('.board-marker').text();
    });
    return resolve();
  });
};
const loadPostPreview = () => {
  return new Promise(function(resolve, reject) {
      return $.ajax('/source.json').then((result) => {
        return resolve(result.posts);
      }).catch(function(){ return reject(...arguments);});
  });
};
const displayPostPreview = (posts) => {
  return new Promise(function(resolve, reject) {
    const previewAnchor = $('.post-preview-box');
    posts.forEach((post) => {
      const template = $('.template.post-preview').clone(true, true);
      template.removeClass('template');
      const thread = post.thread === undefined ? post.postNumber : post.thread;
      template.find('.board-marker').text(`/${post.board}/${thread}/`);
      template.find('.tripcode-marker').text(post.tripcode ? post.tripcode : 'none');
      const trimmed = (() => {
        if(post.content.length > 100){
          return post.content.substr(0,100);
        } else return post.content;
      })();
      template.find('span.content').html(trimmed);
      previewAnchor.append(template);
    });
    $('.bumper').addClass('hidden');
    $('.post-preview-wrapper').removeClass('hidden');

    return resolve();
  });
};

$(document).ready(() => {
  return initPage()
  .then(initPreviewLinks)
  .then(loadPostPreview)
  .then(displayPostPreview)
  .then(loadingComplete)
  .catch(function() { displayErrors(...arguments); });
});
