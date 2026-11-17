import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {parseHandoff,applyHandoffStructure} from '../lib/handoff.mjs';
import {emptyTrip,validateTrip} from '../lib/model.mjs';
import {createAi} from '../lib/ai.mjs';
import {readDocxSource} from '../lib/docx-source.mjs';
import {mergeTrips} from '../public/merge.js';
import {planPartialUpdate} from '../public/partial-update.js';
import {activeStops} from '../public/branches.js';
import {pendingPreparationCount} from '../public/preparations.js';

const source=`【旅行交接稿 v1】
旅行名称：北海道冬季初稿
目的地：北海道
出行人数：4人
旅行开始：2027-01-16
旅行结束：2027-01-22
【行程正文】
【日期｜2027-01-16｜旭川 → 美瑛】
【共同主线】
08:35–09:30｜旭川机场（领取租车）
导航点：旭川空港
摘要：领取车辆与行李。
【分支｜旭岳天气方案】
选择时间：09:30
汇合说明：下午返回酒店。
选择前确认：
- [ ] 确认天气与路况
【方案｜Plan A｜正常开放】
适用条件：缆车正常且视野合适。
10:00–12:00｜旭岳（雪鞋徒步）
路线：自驾前往缆车站。
导航点：旭岳ロープウェイ
摘要：短途徒步摄影。
提醒：停车：按现场指引。
准备事项：
- [ ] 带上手套
【扩展｜参考班次】
整点发车，按现场情况调整。
【方案｜Plan B｜停运替代】
适用条件：缆车停运。
10:00–12:00｜美瑛（森林徒步）
导航点：美瑛駅
摘要：改为预约的森林路线。
【结束分支】
【共同主线】
待定｜旭川酒店（入住）
摘要：回房间休息。
【行程正文结束】
【私人资料】
1月16日已订酒店，仅所有者可见。
【回顾与参考附录】
10:00–12:00｜这条回顾不能变成行程
准备事项：不能导入的旧想法`;
const draft=()=>{const trip=emptyTrip();applyHandoffStructure(trip,parseHandoff(source));return validateTrip(trip);};

test('handoff restores both same-time branches, decision checks, unknown times and excludes appendix',()=>{
 const trip=draft(),day=trip.days[0],group=day.routeGroups[0];assert.equal(trip.endDate,'2027-01-22');assert.equal(trip.travelers,'4人');assert.equal(day.stops.length,4);assert.equal(group.options.length,2);assert.equal(group.selectedOptionId,'');assert.equal(pendingPreparationCount(trip),1);assert.equal(activeStops(day).length,2);
 const a=day.stops.find(s=>s.title.startsWith('旭岳'));assert.equal(a.location,'旭岳ロープウェイ');assert.equal(a.description,'短途徒步摄影。');assert.equal(a.layout,'standard');assert.equal(a.preparations[0].title,'带上手套');assert.equal(a.extensions[0].title,'参考班次');assert.equal(day.stops.at(-1).time,'');
 assert.notEqual(group.options[0].stopIds[0],group.options[1].stopIds[0]);group.selectedOptionId=group.options[0].id;assert.equal(pendingPreparationCount(trip),2);group.preparations[0].done=true;assert.equal(pendingPreparationCount(trip),1);
});
test('malformed branch boundaries fail before data is flattened',()=>{
 assert.equal(parseHandoff('普通的飞书文稿'),null);
 for(const invalid of [source.replace('【结束分支】',''),source.replace('【日期｜2027-01-16','【日期｜2027-02-30'),source.replace('【分支｜旭岳天气方案】','【方案｜A｜孤立方案】'),source.replace('选择时间：09:30','选择时间：25:00')])assert.throws(()=>parseHandoff(invalid),/旅行交接稿/);
});
test('MiMo draft preview preserves original branches even when model omits or combines them',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'trip-handoff-'));t.after(()=>rm(dir,{recursive:true,force:true}));await writeFile(join(dir,'mimo.json'),JSON.stringify({apiKey:'test-only-key-for-mimo',model:'mimo-v2.6-pro'}));let calls=0;
 const ai=createAi(dir,{fetchImpl:async(_url,options)=>{calls++;const content=JSON.parse(options.body).messages[1].content;assert.ok(!content.includes('不能导入的旧想法'));return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({trip:{title:'北海道',days:[{date:'2027-01-16',city:'旭川',stops:[{time:'10:00',title:'旭岳',kind:'museum',description:'模型摘要'}]}],tickets:[{title:content.includes('以下仅整理私人')?'酒店订单':'不应从公共节点生成的订单',kind:'hotel',date:'2027-01-16',status:'confirmed'}]}})}}]}));}});
 const preview=await ai.organize(source);assert.equal(calls,2);assert.equal(preview.trip.days[0].stops.length,4);assert.equal(preview.trip.days[0].routeGroups.length,1);assert.equal(preview.trip.tickets.length,1);assert.equal(preview.trip.tickets[0].title,'酒店订单');assert.equal(preview.trip.tickets[0].visibility,'private');assert.equal(preview.trip.days[0].stops.find(s=>s.title==='旭岳').kind,'museum');assert.equal(preview.trip.days[0].stops.find(s=>s.title==='旭岳').description,'短途徒步摄影。');
});
test('repeated merge and day update retain route references, choice and checkmarks',()=>{
 const trip=draft(),group=trip.days[0].routeGroups[0];group.selectedOptionId=group.options[0].id;group.preparations[0].done=true;
 const merged=validateTrip(mergeTrips(trip,draft()));assert.equal(merged.days[0].stops.length,4);assert.equal(merged.days[0].routeGroups.length,1);assert.equal(merged.days[0].routeGroups[0].selectedOptionId,group.selectedOptionId);assert.equal(merged.days[0].routeGroups[0].preparations[0].done,true);
 const updated=validateTrip(planPartialUpdate(trip,draft(),{date:'2027-01-16',mode:'update'}).trip);assert.equal(updated.days[0].routeGroups.length,1);assert.equal(updated.days[0].routeGroups[0].preparations[0].done,true);assert.doesNotThrow(()=>validateTrip(updated));
});

function zip(entries){let offset=0;const locals=[],directory=[];for(const [name,body] of entries){const filename=Buffer.from(name),plain=Buffer.from(body),packed=deflateRawSync(plain),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(plain.length,22);local.writeUInt16LE(filename.length,26);const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(8,10);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(plain.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);locals.push(local,filename,packed);directory.push(central,filename);offset+=local.length+filename.length+packed.length;}const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,dir,end]);}
test('Word extraction keeps paragraphs, tables and hyperlink targets without fetching relationships',()=>{
 const doc=zip([['word/document.xml','<w:document><w:body><w:p><w:r><w:t>【旅行交接稿 v1】</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>路线：先取车 &amp; 确认路况</w:t></w:r><w:hyperlink r:id="r1"><w:r><w:t>官方网页</w:t></w:r></w:hyperlink></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'],['word/_rels/document.xml.rels','<Relationships><Relationship Id="r1" Target="https://example.com/path?x=1&amp;y=2" /></Relationships>']]);const result=readDocxSource(doc);assert.match(result.source,/v1】\n路线/);assert.match(result.source,/https:\/\/example.com\/path\?x=1&y=2/);assert.equal(result.paragraphs,2);
 assert.throws(()=>readDocxSource(Buffer.from('not a word file')),/DOCX/);
 const malicious=zip([['word/document.xml','<!DOCTYPE word [<!ENTITY secret SYSTEM "file:///etc/passwd">]><w:p><w:t>不应该解析外部实体和文件</w:t></w:p>']]);assert.throws(()=>readDocxSource(malicious),/外部实体/);
});
