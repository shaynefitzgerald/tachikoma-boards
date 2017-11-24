$(document).ready(() => {
  const isOnThreadPage = (() => {
    return $('.location-anchor').attr('data-thread') !== undefined;
  })();
  const curboard = $('.header-boards-anchor').data('curboard');
  const allboards = $('.header-boards-anchor').text().split(',');
  for (let board in allboards) {
    if (curboard === allboards[board] && isOnThreadPage !== true) {
      $('div.pure-g.header')
      .append(`<div class='pure-u-1-${allboards.length} board-link-disabled'>/${allboards[board]}/</div>`);
    } else {
      $('div.pure-g.header')
      .append(`<a class='pure-u-1-${allboards.length} board-link' href=/${allboards[board]}>/${allboards[board]}/</a>`);
    }
  }
});
