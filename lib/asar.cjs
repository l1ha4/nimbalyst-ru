'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function read(file){
 const buffer=fs.readFileSync(file);
 if(buffer.length<16||buffer.readUInt32LE(0)!==4)throw new Error('Unsupported ASAR header');
 const start=8+buffer.readUInt32LE(4),length=buffer.readUInt32LE(12);
 if(start>buffer.length||length>start-16)throw new Error('Corrupt ASAR header');
 const header=JSON.parse(buffer.subarray(16,16+length).toString('utf8')),entries=new Map();
 function walk(dir,prefix=''){for(const [name,entry]of Object.entries(dir.files||{})){
  if(name==='..'||name==='.'||/[\\/]/.test(name))throw new Error('Unsafe ASAR path');
  const namePath=prefix+name;
  if(entry.files)walk(entry,namePath+'/');else entries.set(namePath,entry);
 }}walk(header);
 function get(name){const e=entries.get(name);if(!e||e.unpacked||e.link)throw new Error('Not a packed file: '+name);const offset=start+Number(e.offset);if(!Number.isSafeInteger(offset)||offset<start||offset+e.size>buffer.length)throw new Error('Invalid ASAR offset');return buffer.subarray(offset,offset+e.size);}
 return {buffer,header,entries,get,sha256:hash(buffer)};
}
function integrity(data,old){const blockSize=old?.blockSize||4194304,blocks=[];for(let i=0;i<data.length;i+=blockSize)blocks.push(hash(data.subarray(i,i+blockSize)));if(!data.length)blocks.push(hash(data));return{algorithm:'SHA256',hash:hash(data),blockSize,blocks};}
function write(archive,changes,destination){
 const header=structuredClone(archive.header),chunks=[];let offset=0;
 function walk(dir,prefix=''){for(const[name,entry]of Object.entries(dir.files||{})){
   const file=prefix+name;if(entry.files){walk(entry,file+'/');continue;}if(entry.unpacked||entry.link)continue;
   const data=changes.has(file)?changes.get(file):archive.get(file);
   entry.offset=String(offset);entry.size=data.length;
   if(changes.has(file)||entry.integrity)entry.integrity=integrity(data,entry.integrity);
   chunks.push(data);offset+=data.length;
 }}walk(header);
 for(const[name,data]of changes){if(archive.entries.has(name))continue;if(name.includes('/'))throw new Error('New files must be at archive root');header.files[name]={size:data.length,offset:String(offset),integrity:integrity(data)};chunks.push(data);offset+=data.length;}
 const json=Buffer.from(JSON.stringify(header)),pickle=Buffer.alloc(Math.ceil((8+json.length)/4)*4);
 pickle.writeUInt32LE(pickle.length-4,0);pickle.writeUInt32LE(json.length,4);json.copy(pickle,8);
 const size=Buffer.alloc(8);size.writeUInt32LE(4,0);size.writeUInt32LE(pickle.length,4);
 const fd=fs.openSync(destination,'wx');try{for(const chunk of [size,pickle,...chunks])fs.writeSync(fd,chunk);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const check=read(destination);for(const[name,data]of changes){if(!check.get(name).equals(data))throw new Error('Archive verification failed: '+name);}
 for(const[name,entry]of archive.entries){if(!entry.unpacked&&!entry.link&&!changes.has(name)&&!check.get(name).equals(archive.get(name)))throw new Error('Unchanged entry differs: '+name);}
 return check;
}
module.exports={read,write,hash};
