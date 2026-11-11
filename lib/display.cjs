'use strict';
const acorn=require('../vendor/acorn.cjs');
const HELPER='__nimbalystRuDisplay120';
const key=n=>n&&(n.type==='Identifier'?n.name:n.value);
const classTargets=/\b(?:generic-typeahead-option-description|generic-typeahead-section-header|command-pill-popover-description|slash-command-tooltip|plugin-card-description|plugin-details-description|workspace-welcome-quick-pick|workspace-welcome-prompt-pick)\b/;
function patch(source,filename,catalog){
 if(!/^out\/renderer\/assets\//.test(filename))return{source,edits:[]};
 if(!classTargets.test(source)&&!/(?:selectedExtension|ext|plugin|selectedPlugin|theme2|activeTheme|selectedTheme)\.(?:\w+\.)*(?:description|tagline|longDescription|highlights)\b/.test(source)&&!source.includes('cmd.description'))return{source,edits:[]};
 if(source.includes('function '+HELPER+'('))throw new Error('Display translation already present; patch the original archive');
 const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}),edits=[];
 function member(n){if(!n)return false;if(n.type==='ChainExpression')return member(n.expression);if(n.type==='LogicalExpression')return member(n.left)||member(n.right);if(n.type==='ConditionalExpression')return member(n.consequent)||member(n.alternate);return n.type==='MemberExpression'&&!n.computed&&['description','tagline','longDescription'].includes(key(n.property))&&/^(?:selectedExtension|ext|plugin|selectedPlugin|theme2|activeTheme|selectedTheme)\./.test(source.slice(n.start,n.end));}
 function walk(n,parent,grandparent,highlight=null){
  if(!n?.type)return;
  if(['ArrowFunctionExpression','FunctionExpression','FunctionDeclaration'].includes(n.type)){
   highlight=null;
   if(parent?.type==='CallExpression'&&parent.callee.type==='MemberExpression'&&key(parent.callee.property)==='map'&&parent.callee.object.type==='MemberExpression'&&key(parent.callee.object.property)==='highlights'&&/^selectedExtension\./.test(source.slice(parent.callee.object.start,parent.callee.object.end))&&n.params[0]?.type==='Identifier')highlight=n.params[0].name;
  }
  if(n.type==='Property'&&!n.computed&&parent?.type==='ObjectExpression'&&grandparent?.type==='CallExpression'){
   const callName=grandparent.callee.type==='MemberExpression'?key(grandparent.callee.property):key(grandparent.callee);
   if(['jsx','jsxs','jsxDEV','createElement'].includes(callName)){
    const prop=key(n.key),cls=parent.properties.find(p=>p.type==='Property'&&key(p.key)==='className'),className=cls?.value.type==='Literal'?cls.value.value:'';
    const eligible=(prop==='children'&&(classTargets.test(className)||member(n.value)||(highlight&&n.value.type==='Identifier'&&n.value.name===highlight)))||(prop==='title'&&n.value.type==='MemberExpression'&&source.slice(n.value.start,n.value.end)==='cmd.description');
    if(eligible&&n.value.type!=='Literal'){
     // Only the rendered value changes. Original objects, callbacks, command IDs and prompts are untouched.
     edits.push({start:n.value.start,end:n.value.end,text:source.slice(n.value.start,n.value.end),context:'display-only',replacement:HELPER+'('+source.slice(n.value.start,n.value.end)+')'});
     return;
    }
   }
  }
  for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(x=>x?.type&&walk(x,n,parent,highlight));else if(v?.type)walk(v,n,parent,highlight);}
 }
 walk(ast);let result=source;
 for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.replacement+result.slice(e.end);
 if(edits.length){
  const normalized=Object.fromEntries(Object.entries(catalog).map(([k,v])=>[k.trim().replace(/\s+/g,' '),v]));
  result+='\n/* Nimbalyst RU: known metadata, translated at display time only. */\nfunction '+HELPER+'(value){if(typeof value!=="string")return value;const dictionary='+HELPER+'.dictionary||('+HELPER+'.dictionary=JSON.parse('+JSON.stringify(JSON.stringify(normalized))+'));const k=value.trim().replace(/\\s+/g," ");return Object.prototype.hasOwnProperty.call(dictionary,k)?dictionary[k]:value;}\n';
  acorn.parse(result,{ecmaVersion:'latest',sourceType:'module'});
 }
 return{source:result,edits};
}
module.exports={patch};
