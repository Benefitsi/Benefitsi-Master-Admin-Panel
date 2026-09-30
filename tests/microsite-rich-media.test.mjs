import test from 'node:test';import assert from 'node:assert/strict';
import {validateRichMedia,approvedRichMedia,mediaNavigation} from '../lib/microsite-rich-media.ts';
const fixture={kind:'video',url:'https://benefitsi.de/media/demo.mp4',poster:'https://benefitsi.de/media/demo.jpg',title:'Drohnenvideo',description:'Synthetische Medienvorschau, keine Aufnahmeleistung enthalten.',rightsConfirmed:true,approved:true};
test('media requires explicit current permission and editorial approval',()=>{assert.equal(approvedRichMedia(fixture,false),null);assert.equal(approvedRichMedia({...fixture,approved:false},true),null);assert.equal(approvedRichMedia(fixture,true).kind,'video')});
test('strict structured sources reject arbitrary iframe/provider queries and raw files',()=>{for(const url of ['<iframe/>','https://evil.example/movie.mp4','https://benefitsi.de/media/raw.insv','https://benefitsi.de/media/demo.mp4?token=secret']) assert.equal(validateRichMedia({...fixture,url}),null);assert.equal(validateRichMedia({...fixture,kind:'tour',url:'https://kuula.co/share/collection/abcdef'}).kind,'tour');assert.equal(validateRichMedia({...fixture,kind:'panorama',url:'https://kuula.co/post/abc'}),null)});
test('navigation never keeps an empty or denied media anchor',()=>{const links=[{anchor:'ueber-uns',label:'Über uns'},{anchor:'einblicke',label:'old'}];assert.equal(mediaNavigation(links,null).length,1);assert.equal(mediaNavigation(links,fixture)[1].label,'Einblicke')});
import {createElement as h,act} from 'react';import {createRoot} from 'react-dom/client';import {JSDOM} from 'jsdom';import {loadTypescript} from './helpers/load-typescript.mjs';
const {MicrositeRichMedia}=loadTypescript('components/microsite/microsite-rich-media.tsx');
test('actual component creates heavy player only after explicit click; denied and unapproved stay absent',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'});global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.getElementById('root'));
 try {
  for(const media of [fixture,{...fixture,kind:'tour',url:'https://kuula.co/share/collection/synthetic'}]) {
   await act(()=>root.render(h(MicrositeRichMedia,{key:media.kind,media,permitted:true})));
   assert.equal(document.querySelector('video,iframe,source'),null);
   const button=document.querySelector('button');assert.ok(button);await act(()=>button.click());
   assert.ok(document.querySelector(media.kind==='video'?'video[controls]':'iframe[title]'));
   assert.equal(document.querySelector('video[autoplay]'),null);
  }
  await act(()=>root.render(h(MicrositeRichMedia,{media:fixture,permitted:false})));assert.equal(document.querySelector('section'),null);
  await act(()=>root.render(h(MicrositeRichMedia,{media:{...fixture,approved:false},permitted:true})));assert.equal(document.querySelector('section'),null);
 } finally {await act(()=>root.unmount());dom.window.close();delete global.window;delete global.document;delete global.IS_REACT_ACT_ENVIRONMENT}
});

test('one video and optional approved tour share one section with separate interaction',async()=>{
 const dom=new JSDOM('<div id="root"></div>');global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.getElementById('root'));
 try {
  await act(()=>root.render(h(MicrositeRichMedia,{media:fixture,tour:{...fixture,kind:'tour',url:'https://kuula.co/share/collection/synthetic'},permitted:true})));
  assert.equal(document.querySelectorAll('#einblicke').length,1);assert.equal(document.querySelectorAll('button').length,2);
  await act(()=>document.querySelectorAll('button')[0].click());assert.ok(document.querySelector('video'));assert.equal(document.querySelector('iframe'),null);
  await act(()=>document.querySelector('button').click());assert.ok(document.querySelector('iframe'));
 }finally{await act(()=>root.unmount());dom.window.close();delete global.window;delete global.document;delete global.IS_REACT_ACT_ENVIRONMENT}
});
