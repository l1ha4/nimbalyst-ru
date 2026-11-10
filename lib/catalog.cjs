'use strict';
const fs=require('node:fs'),path=require('node:path');
function readJSON(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function load(root){
 const catalog=readJSON(path.join(root,'locales','ru.json'));
 const manual={};
 for(const line of fs.readFileSync(path.join(root,'locales','manual.tsv'),'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){
  if(!line)continue;
  const tab=line.indexOf('\t');if(tab<1){if(line.startsWith('#'))continue;throw new Error('Invalid manual.tsv line: '+line);}
  manual[line.slice(0,tab)]=line.slice(tab+1);
 }
 for(const key of Object.keys(catalog)){
  if(Object.hasOwn(manual,key))catalog[key]=manual[key];
  else {const bare=key.replace(/(?:\.\.\.|…)$/,'');if(Object.hasOwn(manual,bare))catalog[key]=manual[bare]+(bare!==key?'…':'');}
 }
 Object.assign(catalog,manual);
 const custom=path.join(root,'locales','custom.json');if(fs.existsSync(custom))Object.assign(catalog,readJSON(custom));
 for(const[k,v]of Object.entries(catalog)){
  if(typeof v!=='string'||!v.trim())throw new Error('Invalid translation: '+k);
  const vars=s=>[...s.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort().join('|');
  if(vars(k)!==vars(v))throw new Error('Translation placeholders differ: '+k);
 }
 return catalog;
}
module.exports={load,readJSON};
