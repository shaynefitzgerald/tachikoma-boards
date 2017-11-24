const tripcode = require('tripcode');
const shortid = require('shortid').generate;

if (String.prototype.trimToLength === undefined) {
  String.prototype.trimToLength = function(max) {
    if (this.length < max) return this;
    else {
      return this.substr(0, max);
    }
  };
}

module.exports = function(ctx, storage, trip){
  if(trip.indexOf(' ##') > -1){
    const seg = trip.split(' ##');
    seg[0] = seg[0].trimToLength(32);
    let salt = ctx.tripSalt !== undefined ? ctx.tripSalt : "nosalt";
    const secTrip = tripcode(`${seg[1]}${salt}`);
    return `${seg[0]}!!${secTrip}}`;
  } else if(trip.indexOf(' #') > -1){
    const seg = trip.split(' #');
    seg[0] = seg[0].trimToLength(32);
    return `${seg[0]}!${tripcode(seg[1])}`;
  } else {
    return tripcode(trip);
  }
};
