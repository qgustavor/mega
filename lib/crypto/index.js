exports.formatKey = function(key) {
  if (typeof key === 'string') {
    return new Buffer(exports.base64Clean(key), 'base64')
  }
  return key
}

// MEGA API uses a variation of base64 with -_ instead of +/
// and the trailing = stripped
exports.base64Addons = function(s) {
  return s.replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
}

exports.base64Clean = function(s) {
  s += '=='.substr((2-s.length*3)&3)
  return s.replace(/\-/g,'+').replace(/_/g,'/').replace(/,/g,'')
}
