import {inflateRawSync} from 'node:zlib';

const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const decode=text=>text.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[a-f0-9]+);/gi,entity=>{
 const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(named[entity])return named[entity];
 const n=entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);
 return Number.isInteger(n)&&n>=0&&n<=0x10ffff?String.fromCodePoint(n):'';
});

// Only read bounded XML entries. Never extract paths, execute macros, or fetch
// external relationships from an uploaded Office archive.
export function readDocxSource(input){
 const bytes=Buffer.from(input);if(bytes.length>20*1024*1024)invalid('Word 文件不能超过 20 MB。');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 if(end<0)invalid('不是有效的 DOCX 文件，请使用 Word 文档另存为 .docx。');
 const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16),size=bytes.readUInt32LE(end+12);
 if(count>2000||offset+size>end||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))invalid('Word 压缩包结构不受支持。');
 const entries=new Map();let cursor=offset;
 for(let i=0;i<count;i++){
  if(cursor+46>offset+size||bytes.readUInt32LE(cursor)!==0x02014b50)invalid('Word 文件目录损坏。');
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),expanded=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extraLength=bytes.readUInt16LE(cursor+30),commentLength=bytes.readUInt16LE(cursor+32),local=bytes.readUInt32LE(cursor+42),next=cursor+46+nameLength+extraLength+commentLength;
  if(next>offset+size)invalid('Word 文件目录不完整。');const name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
  if(['word/document.xml','word/_rels/document.xml.rels'].includes(name)){
   if(entries.has(name)||flags&1||![0,8].includes(method)||expanded>8*1024*1024||local+30>offset||bytes.readUInt32LE(local)!==0x04034b50)invalid('Word 正文过大、加密或已损坏。');
   const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
   if(start+compressed>offset)invalid('Word 正文不完整。');
   let xml;try{xml=method===0?bytes.subarray(start,start+compressed):inflateRawSync(bytes.subarray(start,start+compressed),{maxOutputLength:8*1024*1024});}catch{invalid('无法解压 Word 正文。');}
   if(xml.length!==expanded)invalid('Word 正文长度不一致。');entries.set(name,xml.toString('utf8'));
  }
  cursor=next;
 }
 if(!entries.has('word/document.xml'))invalid('Word 文件没有可读取的正文。');
 const links=new Map(),attr=(tag,key)=>decode(new RegExp('(?:^|\\s)'+key+'=["\']([^"\']*)["\']').exec(tag)?.[1]||'');
 for(const tag of (entries.get('word/_rels/document.xml.rels')||'').matchAll(/<Relationship\b([^>]*)\/?\s*>/g)){const target=attr(tag[1],'Target');if(/^https?:\/\//i.test(target))links.set(attr(tag[1],'Id'),target);}
 const xml=entries.get('word/document.xml');if(/<!DOCTYPE|<!ENTITY/i.test(xml))invalid('不支持包含外部实体的 Word 正文。');
 const paragraphs=[];
 for(const paragraph of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)){
  let body=paragraph[1].replace(/<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>/g,(_all,attrs,inner)=>inner+(links.has(attr(attrs,'r:id'))?`<w:t> ${links.get(attr(attrs,'r:id')).replaceAll('&','&amp;')}</w:t>`:''));
  let text='';for(const token of body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(?:tab|br)\b[^>]*\/?\s*>/g))text+=token[1]===undefined?' ':decode(token[1]);
  if(text.trim())paragraphs.push(text.trim());
 }
 const source=paragraphs.join('\n');if(source.length<20)invalid('Word 正文太少，或正文是扫描图片，请提供可编辑的文字。');if(source.length>80000)invalid('Word 正文超过 80000 字，请按日期拆分。');
 return {source,characters:source.length,paragraphs:paragraphs.length,warnings:['已读取 Word 文字和超链接；图片、视频和互动仍保留在原文档，可另行上传。']};
}
