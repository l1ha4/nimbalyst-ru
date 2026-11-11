#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const asar=require('./lib/asar.cjs'),strings=require('./lib/strings.cjs'),html=require('./lib/html.cjs');
const {load,loadDisplay,readJSON}=require('./lib/catalog.cjs');
const display=require('./lib/display.cjs');
const ROOT=__dirname,MOD=readJSON(path.join(ROOT,'mod.json')),MARKER='nimbalyst-ru.json';
const STATE_ROOT=process.env.NIMBALYST_RU_STATE_DIR||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'Nimbalyst-RU');
function json(file,obj){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n','utf8');fs.renameSync(tmp,file);}
function inside(root,rel){if(path.isAbsolute(rel)||rel.split(/[\\/]/).includes('..'))throw new Error('Недопустимый относительный путь');const p=path.resolve(root,rel),r=path.relative(path.resolve(root),p);if(r.startsWith('..')||path.isAbsolute(r))throw new Error('Путь вне каталога');return p;}
function ensureNoSymlink(file){let p=path.resolve(file);while(true){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw new Error('Символические ссылки и junction не поддерживаются: '+p);const parent=path.dirname(p);if(parent===p)break;p=parent;}}
function detect(explicit){
 const dirs=explicit?[explicit]:[path.join(process.env.ProgramFiles||'C:/Program Files','Nimbalyst'),path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'Programs','Nimbalyst'),path.join(process.env.LOCALAPPDATA||'','Nimbalyst')];
 const matches=dirs.filter(p=>fs.existsSync(path.join(p,'resources','app.asar'))||fs.existsSync(path.join(p,'resources','app.asar.nimbalyst-ru-rollback')));
 if(matches.length!==1)throw new Error('Не найден единственный каталог Nimbalyst. Укажите --app-dir "C:\\...\\Nimbalyst".');
 const appDir=fs.realpathSync(matches[0]);ensureNoSymlink(path.join(appDir,'resources','app.asar'));
 const archivePath=path.join(appDir,'resources','app.asar'),recovery=!fs.existsSync(archivePath);
 const archive=asar.read(recovery?archivePath+'.nimbalyst-ru-rollback':archivePath),pkg=JSON.parse(archive.get('package.json').toString());
 if(pkg.name!=='@nimbalyst/electron')throw new Error('Это не пакет Nimbalyst. Изменения отменены.');
 const id=asar.hash(Buffer.from(appDir.toLowerCase())).slice(0,16),stateDir=path.join(STATE_ROOT,id);
 const marker=archive.entries.has(MARKER)?JSON.parse(archive.get(MARKER).toString()):null;
 return {appDir,archive,version:pkg.version,marker,stateDir,stateFile:path.join(stateDir,'installation.json'),tested:MOD.testedAppVersions.includes(pkg.version),recovery};
}
function running(){if(process.platform!=='win32')return false;const r=cp.spawnSync('tasklist.exe',['/FI','IMAGENAME eq Nimbalyst.exe','/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Не удалось проверить, закрыта ли Nimbalyst.');return /"Nimbalyst\.exe"/i.test(r.stdout);}
function stopped(){if(running())throw new Error('Сначала закройте Nimbalyst, включая значок в трее. Принудительное завершение не выполняется.');}
function filesUnder(dir){if(!fs.existsSync(dir))return[];let out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw new Error('Ссылка в каталоге расширений: '+p);if(e.isDirectory())out.push(...filesUnder(p));else out.push(p);}return out;}
function audit(info,catalog,stageDir){
 const changes=new Map(),files=[],unknown=new Map(),displaySites=[];const displayCatalog=loadDisplay(ROOT);let count=0,known=0,total=0;
 function record(result,rel){for(const x of result.edits){count++;known++;total++;}for(const x of result.missing){if(!/[A-Za-z]/.test(x.text)||/^([a-z_0-9.:-]+|[A-Z_0-9]+)$/.test(x.text)||/^var\(|^https?:|^data\(/.test(x.text))continue;total++;const key=strings.normalized(x.text);const entry=unknown.get(key)||{text:key,files:[],context:x.context};if(!entry.files.includes(rel))entry.files.push(rel);unknown.set(key,entry);}}
 const ignoredNames=/worker|(?:^|\/)(?:prism|es-module-shims)/;
 for(const[rel,entry]of info.archive.entries){
  if(entry.unpacked||entry.link||!rel.startsWith('out/'))continue;
  if(rel.endsWith('.js')&&!ignoredNames.test(rel)&&(/out\/renderer\/assets\//.test(rel)||rel==='out/main/index.js')){
   const source=info.archive.get(rel).toString('utf8');const result=strings.patch(source,rel,catalog);record(result,rel);const rendered=display.patch(result.source,rel,displayCatalog);if(rendered.edits.length)displaySites.push({file:rel,sites:rendered.edits.map(e=>e.text)});if(result.edits.length||rendered.edits.length)changes.set(rel,Buffer.from(rendered.source));
  }else if(rel.startsWith('out/renderer/')&&rel.endsWith('.html')){const source=info.archive.get(rel).toString('utf8'),result=html.patch(source,catalog);if(result.source!==source){changes.set(rel,Buffer.from(result.source));count+=result.count;}}
 }
 for(const file of filesUnder(path.join(info.appDir,'resources','extensions'))){
  const rel=path.relative(info.appDir,file).replaceAll('\\','/');
  if(!rel.endsWith('.js')||ignoredNames.test(rel))continue;
  const source=fs.readFileSync(info.originalFiles?.get(rel)||file,'utf8'),result=strings.patch(source,rel,catalog);record(result,rel);
  if(result.edits.length)files.push({rel,data:Buffer.from(result.source),before:asar.hash(Buffer.from(source))});
 }
 const ratio=known/Math.max(1,total),report={mod:MOD.version,appVersion:info.version,testedVersion:info.tested,date:new Date().toISOString(),translatedOccurrences:count,knownFraction:ratio,displayDictionaryEntries:Object.keys(displayCatalog).length,displaySites,changedArchiveEntries:[...changes.keys()],changedExternalFiles:files.map(f=>f.rel),untranslated:[...unknown.values()],note:'Статический анализ поддерживаемых UI-контекстов. Это не процент перевода всего приложения. Пользовательские документы, настройки и журналы в отчёт не включены.'};
 const reportFile=path.join(ROOT,'reports',`compatibility-${info.version}-${Date.now()}.json`);json(reportFile,report);console.log('Отчёт: '+reportFile);console.log(`Переведено вхождений: ${count}; совпадение словаря в проверяемых контекстах: ${(ratio*100).toFixed(1)}%`);
 if(!info.archive.entries.has('out/main/index.js')||!info.archive.entries.has('out/renderer/index.html'))throw new Error('Изменилась структура приложения. Требуется адаптация мода.');
 if(count<MOD.minimumTranslatedOccurrences||ratio<MOD.minimumKnownFraction)throw new Error('Недостаточное совпадение со словарём. Установка остановлена; пришлите отчёт для адаптации.');
 if(stageDir){
  changes.set(MARKER,Buffer.from(JSON.stringify({id:MOD.id,version:MOD.version,appVersion:info.version,originalSha256:info.archive.sha256,installedAt:new Date().toISOString()})));
  fs.mkdirSync(path.join(stageDir,'resources'),{recursive:true});const dest=path.join(stageDir,'resources','app.asar');asar.write(info.archive,changes,dest);files.unshift({rel:'resources/app.asar',before:info.archive.sha256,after:asar.hash(fs.readFileSync(dest))});
  for(const f of files){if(f.data){const dest=inside(stageDir,f.rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,f.data);f.after=asar.hash(f.data);delete f.data;}}
 }
 return {files,report,reportFile};
}
function checkFiles(info,record,mode){
 for(const f of record.files){const target=inside(info.appDir,f.rel);ensureNoSymlink(target);if(!fs.existsSync(target))throw new Error('Отсутствует файл: '+f.rel);const current=asar.hash(fs.readFileSync(target));const expected=mode==='patched'?f.after:f.before;if(current!==expected)throw new Error('Файл изменён обновлением или другим модом: '+f.rel+'. Восстановление старой версии запрещено. Запустите Diagnose.cmd.');}
}
function replaceTransaction(info,record,fromDir,mode){
 const changed=[];
 try{
  for(const f of record.files){const target=inside(info.appDir,f.rel),source=inside(fromDir,f.rel),tmp=target+'.nimbalyst-ru-new',rollback=target+'.nimbalyst-ru-rollback';
   if(fs.existsSync(tmp)||fs.existsSync(rollback))throw new Error('Остался файл прерванной операции: '+target+'. Не удаляйте его; требуется восстановление.');
   const expected=mode==='install'?f.after:f.before;if(asar.hash(fs.readFileSync(source))!==expected)throw new Error('Контрольная сумма исходного файла не совпадает: '+f.rel);
   fs.copyFileSync(source,tmp,fs.constants.COPYFILE_EXCL);if(asar.hash(fs.readFileSync(tmp))!==expected){fs.unlinkSync(tmp);throw new Error('Ошибка проверки временного файла: '+f.rel);}
   try{fs.renameSync(target,rollback);}catch(e){fs.unlinkSync(tmp);throw e;}
   try{fs.renameSync(tmp,target);}catch(e){fs.renameSync(rollback,target);fs.unlinkSync(tmp);throw e;}
   changed.push({target,rollback});
  }
 }catch(e){for(const x of changed.reverse()){fs.unlinkSync(x.target);fs.renameSync(x.rollback,x.target);}throw e;}
 // Backups are retained separately. Rollback sidecars can now be removed.
 for(const x of changed)fs.unlinkSync(x.rollback);
}
function install(info,allowUntested){
 if(info.marker){
  if(!fs.existsSync(info.stateFile))throw new Error('Мод уже установлен, но резервная копия не найдена в этом пакете. Используйте исходную папку русификатора.');
  const state=readJSON(info.stateFile);checkFiles(info,state,'patched');if(info.marker.version!==MOD.version)return upgrade(info,state,allowUntested);console.log('Русификатор уже установлен. Для изменения словаря сначала выполните Uninstall.cmd, затем Install.cmd.');return;
 }
 stopped();fs.mkdirSync(info.stateDir,{recursive:true});
 const stage=path.join(info.stateDir,'staging-'+Date.now());const result=audit(info,load(ROOT),stage);
 if(!info.tested&&!allowUntested)throw new Error('Версия '+info.version+' ещё не проверена. Отчёт подготовлен. Для осознанной пробной установки используйте Install-After-Update.cmd; для адаптации пришлите отчёт.');
 stopped();checkFiles(info,{files:result.files},'original');
 const backupDir=path.join(info.stateDir,'backups',info.version+'-'+info.archive.sha256.slice(0,16));
 for(const f of result.files){const dest=inside(backupDir,f.rel);fs.mkdirSync(path.dirname(dest),{recursive:true});if(!fs.existsSync(dest))fs.copyFileSync(inside(info.appDir,f.rel),dest,fs.constants.COPYFILE_EXCL);if(asar.hash(fs.readFileSync(dest))!==f.before)throw new Error('Повреждена резервная копия: '+f.rel);}
 const record={modVersion:MOD.version,appVersion:info.version,appDir:info.appDir,backupDir,stageDir:stage,status:'prepared',files:result.files,reportFile:result.reportFile,date:new Date().toISOString()};json(info.stateFile,record);
 replaceTransaction(info,record,stage,'install');record.status='installed';json(info.stateFile,record);checkFiles(info,record,'patched');
 const checkedStage=inside(info.stateDir,path.relative(info.stateDir,stage));fs.rmSync(checkedStage,{recursive:true});console.log('Готово: русификатор установлен. Можно открыть Nimbalyst.');
}
function upgrade(info,previous,allowUntested){
 stopped();if(previous.status!=='installed'||previous.appVersion!==info.version)throw new Error('Сначала восстановите незавершённую установку.');
 const originalFiles=new Map();for(const f of previous.files){const p=inside(previous.backupDir,f.rel);ensureNoSymlink(p);if(asar.hash(fs.readFileSync(p))!==f.before)throw new Error('Повреждена резервная копия: '+f.rel);originalFiles.set(f.rel,p);}
 if(!originalFiles.has('resources/app.asar'))throw new Error('Нет оригинального архива для обновления мода.');
 const pristine={...info,archive:asar.read(originalFiles.get('resources/app.asar')),marker:null,originalFiles};
 const stage=path.join(info.stateDir,'staging-'+Date.now()),result=audit(pristine,load(ROOT),stage);
 if(!info.tested&&!allowUntested)throw new Error('Версия '+info.version+' ещё не проверена. Используйте пробный режим.');
 // Translate ORIGINAL bytes first; a failed audit leaves the previous mod fully installed.
 for(const old of previous.files)if(!result.files.some(f=>f.rel===old.rel)){
  const dest=inside(stage,old.rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(originalFiles.get(old.rel),dest);result.files.push({rel:old.rel,before:old.before,after:old.before});
 }
 stopped();checkFiles(info,previous,'patched');
 for(const f of result.files){
  const old=previous.files.find(x=>x.rel===f.rel);if(old)f.previousSha256=old.after;else checkFiles(info,{files:[f]},'original');
  const backup=inside(previous.backupDir,f.rel);ensureNoSymlink(backup);fs.mkdirSync(path.dirname(backup),{recursive:true});if(!fs.existsSync(backup))fs.copyFileSync(inside(info.appDir,f.rel),backup,fs.constants.COPYFILE_EXCL);if(asar.hash(fs.readFileSync(backup))!==f.before)throw new Error('Повреждена резервная копия: '+f.rel);
 }
 const record={modVersion:MOD.version,appVersion:info.version,appDir:info.appDir,backupDir:previous.backupDir,stageDir:stage,status:'prepared',files:result.files,reportFile:result.reportFile,date:new Date().toISOString()};json(info.stateFile,record);
 try{replaceTransaction(info,record,stage,'install');}catch(e){json(info.stateFile,previous);throw e;}
 record.status='installed';json(info.stateFile,record);checkFiles(info,record,'patched');fs.rmSync(inside(info.stateDir,path.relative(info.stateDir,stage)),{recursive:true});console.log('Готово: русификатор обновлён до '+MOD.version+'. Исходные резервные копии сохранены.');
}
function uninstall(info){
 if(!info.marker){console.log('Русификатор отсутствует в текущей версии. Старые резервные копии поверх обновления не восстанавливаются.');return;}
 if(!fs.existsSync(info.stateFile))throw new Error('Не найден журнал установки. Используйте исходную папку русификатора с каталогом state.');
 const record=readJSON(info.stateFile);if(record.appVersion!==info.version)throw new Error('Версия резервной копии отличается от установленной.');
 stopped();checkFiles(info,record,'patched');
 for(const f of record.files){if(asar.hash(fs.readFileSync(inside(record.backupDir,f.rel)))!==f.before)throw new Error('Повреждена резервная копия: '+f.rel);}
 replaceTransaction(info,record,record.backupDir,'uninstall');record.status='removed';json(info.stateFile,record);checkFiles(info,record,'original');console.log('Оригинальные файлы восстановлены побайтно.');
}
function diagnose(info){
 let isRunning=null;try{isRunning=running();}catch{}
 const result={modVersion:MOD.version,appVersion:info.version,testedVersion:info.tested,marker:info.marker,currentArchiveSha256:info.archive.sha256,running:isRunning,installationState:null,files:[]};
 if(fs.existsSync(info.stateFile)){const state=readJSON(info.stateFile);result.installationState=state.status;for(const f of state.files){const p=inside(info.appDir,f.rel);const current=fs.existsSync(p)?asar.hash(fs.readFileSync(p)):null;const backup=inside(state.backupDir,f.rel);result.files.push({file:f.rel,currentSha256:current,expectedOriginal:f.before,expectedPatched:f.after,backupValid:fs.existsSync(backup)&&asar.hash(fs.readFileSync(backup))===f.before});}}
 const dest=path.join(ROOT,'reports','diagnostics-'+Date.now()+'.json');json(dest,result);console.log(JSON.stringify({appVersion:info.version,modInstalled:!!info.marker,report:dest},null,2));if(!info.marker)audit(info,load(ROOT));
}
function recover(info){
 stopped();if(!fs.existsSync(info.stateFile))throw new Error('Нет журнала для восстановления.');
 const record=readJSON(info.stateFile);
 // Preflight EVERY file and sidecar before changing any file; an app update is never rolled back.
 for(const f of record.files){
  const target=inside(info.appDir,f.rel),backup=inside(record.backupDir,f.rel);ensureNoSymlink(target);
  if(!fs.existsSync(backup)||asar.hash(fs.readFileSync(backup))!==f.before)throw new Error('Повреждена резервная копия: '+f.rel);
  if(fs.existsSync(target)){const h=asar.hash(fs.readFileSync(target));if(h!==f.before&&h!==f.after&&h!==f.previousSha256)throw new Error('Неизвестное изменение или новая версия: '+f.rel);}
  else if(!fs.existsSync(target+'.nimbalyst-ru-rollback'))throw new Error('Нет исходного файла и файла отката: '+f.rel);
  for(const suffix of ['.nimbalyst-ru-rollback','.nimbalyst-ru-new']){
   if(fs.existsSync(target+suffix)){const h=asar.hash(fs.readFileSync(target+suffix));if(h!==f.before&&h!==f.after&&h!==f.previousSha256)throw new Error('Неожиданный файл незавершённой операции: '+f.rel+suffix);}
  }
 }
 for(const f of record.files){
  const target=inside(info.appDir,f.rel),backup=inside(record.backupDir,f.rel);
  if(!fs.existsSync(target)||asar.hash(fs.readFileSync(target))!==f.before)fs.copyFileSync(backup,target);
  for(const suffix of ['.nimbalyst-ru-rollback','.nimbalyst-ru-new'])if(fs.existsSync(target+suffix))fs.unlinkSync(target+suffix);
 }
 checkFiles(info,record,'original');record.status='recovered';json(info.stateFile,record);console.log('Прерванная установка отменена. Оригинальные файлы восстановлены.');
}
function main(argv=process.argv.slice(2)){
 const command=argv[0]||'status',idx=argv.indexOf('--app-dir'),info=detect(idx>=0?argv[idx+1]:null);
 console.log(`Nimbalyst RU ${MOD.version} | Nimbalyst ${info.version}`);
 if(command==='status'){console.log(info.marker?'Русификатор установлен.':'Русификатор не установлен.');return;}
 if(command==='diagnose'||command==='audit'){diagnose(info);return;}
 if(!['install','uninstall','recover'].includes(command))throw new Error('Команды: status, diagnose, install, uninstall, recover');
 if(info.recovery&&command!=='recover')throw new Error('Прервана замена архива. Запустите Recover.cmd.');
 fs.mkdirSync(info.stateDir,{recursive:true});const lock=path.join(info.stateDir,'operation.lock');let fd;
 if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock,'utf8'));let alive=true;try{if(Number.isInteger(pid)&&pid>0)process.kill(pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(!alive)fs.renameSync(lock,lock+'.stale-'+Date.now());}
 try{fd=fs.openSync(lock,'wx');fs.writeSync(fd,String(process.pid));}catch(e){throw new Error('Другая операция выполняется или остался неизвестный operation.lock после сбоя. Проверьте журнал перед повтором.');}
 try{if(command==='install')install(info,argv.includes('--allow-untested'));else if(command==='recover')recover(info);else uninstall(info);}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(require.main===module){try{main();}catch(e){console.error('\nОШИБКА: '+e.message);process.exitCode=1;}}
module.exports={main,detect,audit,install,uninstall,diagnose,inside,replaceTransaction,checkFiles,recover};
