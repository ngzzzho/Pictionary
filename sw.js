'use strict';
const PREFIX='pictionary-party-';
const CACHE=PREFIX+'family-v1-9-layerlab-a';
const ASSETS=['./js/decks.mjs','./js/legacy-word-labels.json','./css/content-ui.css','./js/tv.mjs','./js/tv-ui.mjs','./css/tv-ui.css','./css/localization.css','./js/checksum.mjs','./css/gallery-ui.css','./css/backup-ui.css','./js/gallery.mjs','./js/backup.mjs','./js/backup-ui.mjs','./js/profile.mjs','./css/game-ui.css','./css/motion.css','./css/iphone-ux.css','./css/layerlab-slices.css','./js/ui-icons.mjs','./css/ios-layout.css','./assets/layerlab/panel.png','./assets/layerlab/selected.png','./css/layerlab.css','./assets/layerlab/settings.png','./assets/layerlab/pencil.png','./assets/layerlab/book.png','./assets/layerlab/trophy.png','./assets/layerlab/star.png','./assets/layerlab/sound-on.png','./assets/layerlab/sound-off.png','./assets/layerlab/button-square.png','./assets/layerlab/button-red.png','./assets/layerlab/button-white.png','./','./index.html','./css/style.css','./css/tokens.css','./js/app.js','./js/languages.mjs','./js/localization.mjs','./js/locales/ja.json','./js/locales/ko.json','./js/locales/de.json','./js/locales/it.json','./js/locales/en.json','./js/locales/zh.json','./js/locales/zh-Hans.json','./js/locales/es.json','./js/locales/ar.json','./js/locales/fr.json','./js/locales/pt.json','./js/core.mjs','./js/storage.mjs','./js/canvas.mjs','./js/i18n.mjs','./js/artwork.mjs','./js/artwork-store.mjs','./js/content.json','./manifest.webmanifest','./icons/mark.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
// Release assets are cached together. New workers wait until old tabs close;
// never replace a running match with a mixed app version.
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==location.origin||!url.href.startsWith(self.registration.scope))return;
 // Read without opening: an old in-flight request must not recreate a cache
 // already removed by a newer worker's activation.
 event.respondWith((async()=>{
  const hit=await caches.match(event.request,{cacheName:CACHE,ignoreSearch:true});if(hit)return hit;
  try{return await fetch(event.request);}catch(error){if(event.request.mode==='navigate')return await caches.match('./index.html',{cacheName:CACHE});throw error;}
 })());
});
