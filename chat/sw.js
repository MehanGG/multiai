/* MultiAI — service worker khusus notifikasi.
   Letakkan di folder yang sama dengan index.html (mis. /chat/sw.js). */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const id=e.notification.data&&e.notification.data.chat;
  e.waitUntil((async()=>{
    const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of all){
      try{await c.focus()}catch(_){}
      if(id)c.postMessage({type:'open-chat',id});
      return;
    }
    const url=new URL('./',self.registration.scope);
    if(id)url.searchParams.set('c',id);
    if(self.clients.openWindow)await self.clients.openWindow(url.href);
  })());
});
