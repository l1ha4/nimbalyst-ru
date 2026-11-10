'use strict';
const {lookup}=require('./strings.cjs');
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function patch(source,catalog){
 let count=0;let raw=false;
 const result=source.split(/(<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[^]*?-->|<[^>]*>)/gi).map(part=>{
  if(/^<(script|style)\b|^<!--/i.test(part))return part;
  if(part.startsWith('<'))return part.replace(/\blang="en"/,'lang="ru"').replace(/\b(title|aria-label|placeholder)="([^"]*)"/g,(all,key,value)=>{const t=lookup(value,catalog);if(t===null||t===value)return all;count++;return `${key}="${escape(t)}"`;});
  const t=lookup(part,catalog);if(t===null||t===part)return part;count++;return escape(t);
 }).join('');
 return {source:result,count};
}
module.exports={patch};
