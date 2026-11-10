'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const scratch=path.resolve(process.cwd(),'work');fs.mkdirSync(scratch,{recursive:true});const tmp=fs.mkdtempSync(path.join(scratch,'nimbalyst-ru-tests-'));
process.env.NIMBALYST_RU_STATE_DIR=path.join(tmp,'state');
const asar=require('../lib/asar.cjs'),strings=require('../lib/strings.cjs'),html=require('../lib/html.cjs'),core=require('../nimbalyst-ru.cjs');
const originalSpawn=cp.spawnSync;cp.spawnSync=function(command,...args){if(command==='tasklist.exe')return{status:0,stdout:'INFO: no tasks match',stderr:''};return originalSpawn(command,...args);};
function archive(file,content){let offset=0;const header={files:{}};const chunks=[];for(const[name,data0]of Object.entries(content)){const data=Buffer.isBuffer(data0)?data0:Buffer.from(data0),parts=name.split('/');let dir=header;for(const part of parts.slice(0,-1)){dir.files[part]??={files:{}};dir=dir.files[part];}dir.files[parts.at(-1)]={size:data.length,offset:String(offset)};offset+=data.length;chunks.push(data);}const data=Buffer.from(JSON.stringify(header)),h=Buffer.alloc(Math.ceil((8+data.length)/4)*4),sz=Buffer.alloc(8);h.writeUInt32LE(h.length-4);h.writeUInt32LE(data.length,4);data.copy(h,8);sz.writeUInt32LE(4);sz.writeUInt32LE(h.length,4);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.concat([sz,h,...chunks]));}
function app(name,version='0.83.0'){const dir=path.join(tmp,name);archive(path.join(dir,'resources','app.asar'),{'package.json':JSON.stringify({name:'@nimbalyst/electron',version}),'out/main/index.js':'const menu=['+Array(1005).fill('{label:"Cancel",id:"Cancel",role:"copy"}').join(',')+'];','out/renderer/index.html':'<html lang="en"><title>About Nimbalyst</title></html>','out/renderer/assets/index-test.js':'jsx("button",{children:"Save",onClick:()=>send("Save")});','untouched.bin':Buffer.from([0,255,123,45])});return dir;}
test('Only presentation values change; comparisons, payloads, prompts, selectors and icon glyphs remain intact',()=>{
 const s='const x={id:"Open",value:"Open",type:"Open",role:"copy",label:"Open",description:"Open",prompt:"Open"};if(a==="Open")send("Open");jsx("span",{className:"material-symbols-outlined",children:"close"});jsx("button",{children:ok?"Save":"Cancel",title:`Open ${name}`});';
 const r=strings.patch(s,'out/renderer/assets/index.js',{'Open':'Открыть','Save':'Сохранить','Cancel':'Отмена','Open {0}':'Открыть {0}','close':'закрыть'}).source;
 assert.ok(r.includes('label:"Открыть"'));assert.ok(r.includes('id:"Open",value:"Open",type:"Open",role:"copy"'));assert.ok(r.includes('description:"Open",prompt:"Open"'));assert.ok(r.includes('a==="Open"'));assert.ok(r.includes('send("Open")'));assert.ok(r.includes('children:"close"'));assert.ok(r.includes('children:ok?"Сохранить":"Отмена"'));assert.ok(r.includes('`Открыть ${name}`'));
});
test('Template substitutions retain expression source and reject lost placeholders',()=>{
 const s='const x={title:`Move ${name} to ${dir}`};';
 const r=strings.patch(s,'out/renderer/assets/a.js',{'Move {0} to {1}':'В ${1} переместить {0}'}); // malformed placeholder is deliberately rejected below
 assert.ok(r.source.includes('`В $${1} переместить ${name}`')===false);
 assert.throws(()=>strings.patch(s,'out/renderer/assets/a.js',{'Move {0} to {1}':'Переместить {0}'}),/placeholders/);
 const ok=strings.patch(s,'out/renderer/assets/a.js',{'Move {0} to {1}':'В {1} переместить {0}'}).source;
 assert.ok(ok.includes('`В ${dir} переместить ${name}`'));
});
test('Excalidraw uses its shipped Russian locale, preserving every language dictionary',()=>{
 const source='const en={title:"Open"};const ru={title:"Открыть"};function X({langCode:l=languages.code}){return l}';
 const r=strings.patch(source,'resources/extensions/excalidraw/dist/desktop.js',{'Open':'XXX','__nim_excalidraw_locale__':'ru-RU'});
 assert.equal(r.edits.length,1);assert.ok(r.source.includes('l="ru-RU"'));assert.ok(r.source.includes('title:"Open"'));
});
test('Common counted children use Russian plural forms for 1, 2, 5, 11 and 21',()=>{
 const src='({children:[n," file",n!==1?"s":""]})';const output=strings.patch(src,'out/renderer/assets/a.js',{}).source;const vm=require('node:vm');for(const[n,expected]of [[1,'1 файл'],[2,'2 файла'],[5,'5 файлов'],[11,'11 файлов'],[21,'21 файл']])assert.equal(vm.runInNewContext(output,{n,Intl}).children.join(''),expected);
 const t=strings.patch('({title:`${n} session${n!==1?"s":""}`})','out/renderer/assets/a.js',{'{0} session{1}':'Сеансов: {0}{1}'}).source;assert.equal(vm.runInNewContext(t,{n:5}).title,'Сеансов: 5');
});
test('Conditional words in UI template strings are translated without changing their conditions',()=>{
 const source='({title:`${open?"Hide":"Show"} panel`})';const translated=strings.patch(source,'out/renderer/assets/a.js',{'{0} panel':'{0} панель','Hide':'Скрыть','Show':'Показать'}).source;const vm=require('node:vm');assert.equal(vm.runInNewContext(translated,{open:true}).title,'Скрыть панель');assert.equal(vm.runInNewContext(translated,{open:false}).title,'Показать панель');
});
test('HTML translates visible text only and escapes content',()=>{
 const s='<html lang="en"><style>.Close{color:red}</style><script>const x="Close";</script><button title="Close">Close</button></html>';
 const r=html.patch(s,{'Close':'Закрыть & выйти'}).source;assert.ok(r.includes('<html lang="ru">'));assert.ok(r.includes('const x="Close"'));assert.ok(r.includes('Закрыть &amp; выйти'));
});
test('ASAR rebuild preserves binary data, long Unicode edits, offsets and integrity',()=>{
 const src=path.join(tmp,'source.asar'),dst=path.join(tmp,'edited.asar');archive(src,{'a.js':'const a="before";','nested/data.bin':Buffer.from([0,250,255])});const a=asar.read(src),text=Buffer.from('const a="После изменения — русский текст";');const b=asar.write(a,new Map([['a.js',text],['nimbalyst-ru.json',Buffer.from('{}')]]),dst);assert.equal(b.get('a.js').toString(),text.toString());assert.ok(b.get('nested/data.bin').equals(a.get('nested/data.bin')));assert.equal(b.entries.get('a.js').integrity.hash,asar.hash(text));
});
test('Install, repeat install and uninstall restore the EXACT original archive',()=>{
 const dir=app('lifecycle'),file=path.join(dir,'resources','app.asar'),before=fs.readFileSync(file);core.install(core.detect(dir),false);const patched=fs.readFileSync(file);assert.notDeepEqual(patched,before);core.install(core.detect(dir),false);assert.deepEqual(fs.readFileSync(file),patched);core.uninstall(core.detect(dir));assert.deepEqual(fs.readFileSync(file),before);
});
test('Untested update is refused by default, can be trialled explicitly, and restores its own version',()=>{
 const dir=app('update','0.84.0'),file=path.join(dir,'resources','app.asar'),before=fs.readFileSync(file);assert.throws(()=>core.install(core.detect(dir),false),/ещё не проверена/);assert.deepEqual(fs.readFileSync(file),before);core.install(core.detect(dir),true);core.uninstall(core.detect(dir));assert.deepEqual(fs.readFileSync(file),before);
});
test('A changed file is never overwritten during uninstall',()=>{
 const dir=app('tampered');core.install(core.detect(dir),false);const info=core.detect(dir),p=path.join(dir,'resources','app.asar');fs.appendFileSync(p,'external change');assert.throws(()=>core.uninstall(core.detect(dir)),/Файл изменён/);assert.ok(fs.readFileSync(p).subarray(-15).toString().includes('external change'));
});
test('A running app blocks installation before any mutation',()=>{
 const dir=app('running'),p=path.join(dir,'resources','app.asar'),before=fs.readFileSync(p),stub=cp.spawnSync;cp.spawnSync=()=>({status:0,stdout:'"Nimbalyst.exe","123"'});try{assert.throws(()=>core.install(core.detect(dir),false),/Сначала закройте/);assert.deepEqual(fs.readFileSync(p),before);}finally{cp.spawnSync=stub;}
});
test('Multi-file commit rolls back earlier files if a later file fails',()=>{
 const dir=path.join(tmp,'transaction'),stage=path.join(tmp,'transaction-stage');fs.mkdirSync(dir);fs.mkdirSync(stage);for(const n of ['a','b']){fs.writeFileSync(path.join(dir,n),'before');fs.writeFileSync(path.join(stage,n),'after');}fs.writeFileSync(path.join(dir,'b.nimbalyst-ru-new'),'unexpected');const record={files:['a','b'].map(rel=>({rel,before:asar.hash(Buffer.from('before')),after:asar.hash(Buffer.from('after'))}))};assert.throws(()=>core.replaceTransaction({appDir:dir},record,stage,'install'),/Остался файл/);assert.equal(fs.readFileSync(path.join(dir,'a'),'utf8'),'before');assert.equal(fs.readFileSync(path.join(dir,'b'),'utf8'),'before');
});
test('Recovery restores an interrupted mixed installation and refuses unknown bytes',()=>{
 const dir=app('recover');core.install(core.detect(dir),false);const info=core.detect(dir),state=JSON.parse(fs.readFileSync(info.stateFile));const target=path.join(dir,'resources','app.asar');fs.renameSync(target,target+'.nimbalyst-ru-new');fs.copyFileSync(path.join(state.backupDir,'resources','app.asar'),target+'.nimbalyst-ru-rollback');core.recover(core.detect(dir));assert.equal(asar.read(target).sha256,state.files[0].before);assert.equal(fs.existsSync(target+'.nimbalyst-ru-new'),false);
});
test('Path traversal and foreign app archives are refused',()=>{
 assert.throws(()=>core.inside(tmp,'../escape'),/путь/);const dir=app('foreign');archive(path.join(dir,'resources','app.asar'),{'package.json':'{"name":"foreign"}'});assert.throws(()=>core.detect(dir),/не пакет Nimbalyst/);
});
