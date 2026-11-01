/* Compatibility only: retired screens do not remain parallel destinations. */
(function () {
  'use strict';
  var hash=location.hash.slice(1),map={};
  try{map=JSON.parse(document.body.dataset.routes||'{}');}catch(e){}
  var root=document.documentElement.dataset.root||'';
  var url=new URL(root+(map[hash]||document.body.dataset.redirect),location.href);
  var source=new URLSearchParams(location.search);
  ['data','building','height','motion','prior','layers','layer'].forEach(function(key){if(source.has(key)&&!url.searchParams.has(key))url.searchParams.set(key,source.get(key));});
  location.replace(url.href);
}());
