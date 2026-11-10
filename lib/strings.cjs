'use strict';
const acorn = require('../vendor/acorn.cjs');
const displayKeys = new Set(['children','label','title','placeholder','aria-label','aria-description','tooltip','subtitle','buttonLabel','confirmLabel','cancelLabel','emptyMessage','emptyText','loadingText','helperText','header']);
const keyOf = n => n && (n.type === 'Identifier' ? n.name : n.value);
const pluralForms={file:['файл','файла','файлов'],folder:['папка','папки','папок'],session:['сеанс','сеанса','сеансов'],item:['элемент','элемента','элементов'],message:['сообщение','сообщения','сообщений'],row:['строка','строки','строк'],change:['изменение','изменения','изменений'],task:['задача','задачи','задач'],commit:['коммит','коммита','коммитов'],worktree:['рабочее дерево','рабочих дерева','рабочих деревьев'],turn:['ход','хода','ходов'],match:['совпадение','совпадения','совпадений'],result:['результат','результата','результатов']};
const englishSuffix=n=>n?.type==='ConditionalExpression'&&n.consequent.type==='Literal'&&n.alternate.type==='Literal'&&[n.consequent.value,n.alternate.value].sort().join('|')==='|s';
function collect(source, filename = '') {
  const nativeExcalidraw=/extensions\/excalidraw\/dist\/desktop\.js$/.test(filename);
  const ast = acorn.parse(source,{ecmaVersion:'latest',sourceType:filename.includes('/main/')?'script':'module',allowReturnOutsideFunction:true});
  const found = new Map(),special=[];
  function expressionLeaves(node,base){const leaves=[];function visit(n){if(n.type==='Literal'&&typeof n.value==='string')leaves.push({start:n.start-base,end:n.end-base,text:n.value});else if(n.type==='ConditionalExpression'){visit(n.consequent);visit(n.alternate);}else if(n.type==='LogicalExpression')visit(n.right);}visit(node);return leaves;}
  function add(n, context) {
    if (!n) return;
    if(n.type === 'Literal' && typeof n.value === 'string') {
      if(/[A-Za-z]/.test(n.value)) found.set(n.start,{start:n.start,end:n.end,text:n.value,context,kind:'literal'});
    } else if(n.type === 'TemplateLiteral') {
      const text=n.quasis.map((q,i)=>(q.value.cooked??q.value.raw)+(i<n.expressions.length?`{${i}}`:'')).join('');
      if(/[A-Za-z]/.test(text)) found.set(n.start,{start:n.start,end:n.end,text,context,kind:'template',expressions:n.expressions.map(e=>englishSuffix(e)?'('+source.slice(e.test.start,e.test.end)+', "")':source.slice(e.start,e.end)),expressionEdits:n.expressions.map(e=>englishSuffix(e)?[]:expressionLeaves(e,e.start))});
    } else if(n.type === 'ConditionalExpression') { add(n.consequent,context);add(n.alternate,context); }
    else if(n.type === 'LogicalExpression') {add(n.right,context);}
    else if(n.type === 'ArrayExpression') n.elements.forEach(e=>add(e,context));
    // Do not descend into calls, object values, comparisons, indexes, or binary expressions.
  }
  function walk(n,parent,grandparent,functionName='') {
    if(!n || typeof n !== 'object') return;
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type))functionName=n.id?.name||(parent?.type==='VariableDeclarator'?parent.id?.name:parent?.type==='Property'?keyOf(parent.key):'')||'';
    if(!nativeExcalidraw&&n.type==='ArrayExpression'&&parent?.type==='Property'&&keyOf(parent.key)==='children')for(let i=1;i<n.elements.length;i++){
      const prev=n.elements[i-1],suffix=n.elements[i];
      if(prev?.type!=='Literal'||typeof prev.value!=='string'||!pluralForms[prev.value.trim()]||!englishSuffix(suffix)||suffix.test.type!=='BinaryExpression')continue;
      const test=suffix.test,count=test.right.type==='Literal'&&test.right.value===1?test.left:test.left.type==='Literal'&&test.left.value===1?test.right:null;
      if(!count||!['Identifier','MemberExpression'].includes(count.type))continue;
      const forms=pluralForms[prev.value.trim()],countCode=source.slice(count.start,count.end),map={one:forms[0],few:forms[1],many:forms[2],other:forms[1]};
      special.push({start:prev.start,end:prev.end,text:prev.value,context:'russian-plural',kind:'raw',replacement:JSON.stringify(prev.value.match(/^\s*/)[0])});
      special.push({start:suffix.start,end:suffix.end,text:'English plural suffix',context:'russian-plural',kind:'raw',replacement:'('+JSON.stringify(map)+')[new Intl.PluralRules("ru").select('+countCode+')]'});
    }
    if(!nativeExcalidraw&&n.type==='VariableDeclarator'&&n.init?.type==='ObjectExpression'&&/(?:_LABELS|_DESCRIPTIONS|_TOOLTIPS|_TITLES|_PLACEHOLDERS)$/.test(n.id?.name||''))for(const p of n.init.properties)if(p.type==='Property')add(p.value,'display-map');
    if(!nativeExcalidraw&&n.type==='VariableDeclarator'&&n.init?.type==='ObjectExpression'&&n.id?.name==='labels'&&n.init.properties.some(p=>keyOf(p.key)==='files')&&n.init.properties.some(p=>keyOf(p.key)==='agent'))for(const p of n.init.properties)if(p.type==='Property')add(p.value,'mode-label-map');
    if(!nativeExcalidraw&&n.type==='VariableDeclarator'&&n.id?.name==='buttonLabel'&&n.init?.type==='CallExpression'&&keyOf(n.init.callee.property)==='useMemo'&&n.init.arguments[0]?.type==='ArrowFunctionExpression')add(n.init.arguments[0].body,'button-label');
    if(!nativeExcalidraw&&n.type==='ReturnStatement'&&/^(?:get\w*(?:Label|Title|Tooltip|Description|DisplayName|StatusText)|format\w*(?:Date|Time|Ago|Duration|LastModified))$/i.test(functionName))add(n.argument,'display-return');
    if(nativeExcalidraw && n.type==='Property'&&keyOf(n.key)==='langCode'&&n.value.type==='AssignmentPattern'&&n.value.right.type==='MemberExpression'&&keyOf(n.value.right.property)==='code'){
      const value=n.value.right;found.set(value.start,{start:value.start,end:value.end,text:'__nim_excalidraw_locale__',context:'native-locale',kind:'literal'});
    }
    if(!nativeExcalidraw && n.type==='Property' && !n.computed) {
      const key=keyOf(n.key),props=parent?.type==='ObjectExpression'?parent.properties:[];
      const call=grandparent?.type==='CallExpression'?grandparent:null;
      const callName=call?(call.callee.type==='MemberExpression'?keyOf(call.callee.property):keyOf(call.callee)):'';
      const jsx=['jsx','jsxs','jsxDEV','createElement'].includes(callName);
      const dialog=['showMessageBox','showMessageBoxSync','showOpenDialog','showSaveDialog','showOpenDialogSync','showSaveDialogSync'].includes(callName);
      const icon=props.some(p=>keyOf(p.key)==='className'&&/material-symbols|material-icons/.test(source.slice(p.value.start,p.value.end)));
      const description=(key==='description'&&(jsx||props.some(p=>keyOf(p.key)==='title'))&&!props.some(p=>['inputSchema','parameters','properties','type'].includes(keyOf(p.key))))||(key==='body'&&props.some(p=>keyOf(p.key)==='title')&&props.some(p=>keyOf(p.key)==='icon'));
      if((displayKeys.has(key)&&!(key==='children'&&icon))||description||(dialog&&['message','detail','buttons'].includes(key))) {
        add(n.value,key);
        if(filename.includes('/main/')&&key==='label'&&n.value.type==='Literal'&&n.value.value==='Edit'&&props.some(p=>keyOf(p.key)==='submenu'))found.set(n.value.start,{start:n.value.start,end:n.value.end,text:'__nim_menu_edit__',context:'label',kind:'literal'});
      }
    }
    if(!nativeExcalidraw && n.type==='CallExpression') {
      const name=n.callee.type==='MemberExpression'?keyOf(n.callee.property):keyOf(n.callee);
      if(['alert','confirm','showErrorBox','setTitle','setToolTip'].includes(name)) n.arguments.slice(0,name==='showErrorBox'?2:1).forEach(a=>add(a,name));
    }
    for(const [k,v] of Object.entries(n)) if(k!=='start'&&k!=='end') {
      if(Array.isArray(v)) v.forEach(x=>x?.type&&walk(x,n,parent,functionName)); else if(v?.type) walk(v,n,parent,functionName);
    }
  }
  walk(ast);for(const e of special){for(const[k,v]of found)if(v.start>=e.start&&v.end<=e.end)found.delete(k);found.set(e.start,e);}return [...found.values()].sort((a,b)=>a.start-b.start);
}
function normalized(text){return text.trim().replace(/\s+/g,' ');}
function lookup(text,catalog){
  if(Object.hasOwn(catalog,text)) return catalog[text];
  const norm=normalized(text);
  if(Object.hasOwn(catalog,norm)) return (text.match(/^\s*/)||[''])[0]+catalog[norm]+(text.match(/\s*$/)||[''])[0];
  const bare=norm.replace(/(?:\.\.\.|…)$/,'');
  if(bare!==norm && Object.hasOwn(catalog,bare))return (text.match(/^\s*/)||[''])[0]+catalog[bare]+'…'+(text.match(/\s*$/)||[''])[0];
  return null;
}
function render(item,translated,catalog={}){
  if(item.kind==='literal') return JSON.stringify(translated);
  const expected=item.expressions.map((_,i)=>`{${i}}`).sort();
  const actual=[...translated.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort();
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('Template placeholders differ: '+item.text);
  const expressions=item.expressions.map((source,i)=>{for(const e of [...(item.expressionEdits?.[i]||[])].reverse()){const t=lookup(e.text,catalog);if(t!==null&&t!==e.text)source=source.slice(0,e.start)+JSON.stringify(t)+source.slice(e.end);}return source;});
  return '`'+translated.split(/(\{\d+\})/).map(part=>/^\{\d+\}$/.test(part)?'${'+expressions[Number(part.slice(1,-1))]+'}':part.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$\{/g,'\\${')).join('')+'`';
}
function patch(source,filename,catalog){
  const items=collect(source,filename), edits=[],missing=[];
  for(const item of items){if(item.kind==='raw'){edits.push(item);continue;}const t=lookup(item.text,catalog);if(t!==null&&t!==item.text)edits.push({...item,replacement:render(item,t,catalog)});else if(t===null)missing.push(item);}
  for(let i=1;i<edits.length;i++)if(edits[i].start<edits[i-1].end)throw new Error('Overlapping translation ranges: '+filename);
  let result=source;for(const e of [...edits].reverse())result=result.slice(0,e.start)+e.replacement+result.slice(e.end);
  if(edits.length)acorn.parse(result,{ecmaVersion:'latest',sourceType:filename.includes('/main/')?'script':'module',allowReturnOutsideFunction:true});
  return {source:result,edits,missing};
}
module.exports={collect,patch,lookup,render,normalized};
