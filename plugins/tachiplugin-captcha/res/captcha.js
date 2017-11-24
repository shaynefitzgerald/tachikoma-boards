const formBoxAnchor = () => {
  if ($('.location-anchor').length) {
    if ($('.location-anchor').attr('data-thread') !== undefined)
      return $('.reply-anchor');
    else {
      return $('.new-thread-anchor');
    }
  } else
    return -1;
};

const otkFieldInput = ["<input name='otk' value=", " hidden='true' />"];

const hasCaptcha = () => {
  if (formBoxAnchor().find('input[name="otk"]').length !== 0) {
    return true;
  } else if (formBoxAnchor().find('.captcha-form').length !== 0) {
    return true;
  }
  return false;
};

const submitCaptcha = (solution, buttonAnchor, otkWrapper) => {
  return $.ajax($('.captcha-form').attr('action'), {
    method: 'POST',
    dataType: 'json',
    data: {
      'solution': solution
    }
  }).then((res) => {
    if (res.status === "OK") {
      const otkHTML = $(`${otkWrapper[0]}${res.otk}${otkWrapper[1]}`);
      $('.captcha-form').remove();
      $(buttonAnchor).before(otkHTML);
      $(buttonAnchor).attr('disabled', false);
    } else {
      return displayErrors(res.error);
    }
  }).catch(function() {
    return reject(...arguments);
  });
};

const linkCaptcha = (captcha, buttonAnchor, otkWrapper = otkFieldInput) => {
  return new Promise(function(resolve, reject) {
    $(buttonAnchor).before(captcha);
    $(buttonAnchor).parent().find('.captcha-submit').click((evt) => {
      evt.preventDefault();
      const solution = $('.captcha-form').find('input[name="solution"]').val();
      return submitCaptcha(solution, buttonAnchor, otkWrapper);
    });
    return resolve();
  });
};

const loadCaptcha = () => {
  return $.ajax('/captcha/new', {
    'dataType': 'html'
  });
};

$(document).ready(() => {
  const anchor = formBoxAnchor();
  if(anchor === -1) return;
  $(anchor).click((evt) => {
    const buttonAnchor = $(anchor).find('button.submit');
    if (!hasCaptcha()) {
      evt.preventDefault();
      $(buttonAnchor).attr('disabled', true);
      return loadCaptcha()
        .then((res) => {
          return linkCaptcha(res, buttonAnchor);
        })
        .catch((err) => {
          return displayErrors(err);
        });
    } else return;
  });
});
