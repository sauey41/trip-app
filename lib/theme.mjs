export const themePresets=[
 {id:'osaka',name:'大阪 · 城市绿',color:'#285747'},
 {id:'snow',name:'北海道 · 冰雪蓝',color:'#326b91'},
 {id:'sea',name:'海岛 · 海洋青',color:'#246b76'},
 {id:'sakura',name:'春日 · 樱花粉',color:'#87516c'},
 {id:'sand',name:'古城 · 暖沙色',color:'#80603b'},
 {id:'brand',name:'贝克 · 品牌蓝',color:'#194a98'}
];
export function normalizeTheme(value){
 if(value===undefined)return {mode:'auto',preset:'osaka',color:'#285747'};
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('主题设置格式不正确');
 const {mode='auto',preset='osaka',color='#285747'}=value;
 if(!['auto','preset','custom'].includes(mode)||!themePresets.some(p=>p.id===preset))throw new Error('主题选项不正确');
 if(typeof color!=='string'||!/^#[a-f0-9]{6}$/i.test(color))throw new Error('主题颜色需为六位 HEX 色值，例如 #326B91');
 return {mode,preset,color:color.toLowerCase()};
}
export function resolveTheme(trip={}){
 const settings=normalizeTheme(trip.appearance),destination=[trip.cityTo,trip.title,...(trip.days||[]).map(d=>d.city)].filter(Boolean).join(' ').toLowerCase();
 const auto=/北海道|札幌|小樽|旭川|二世谷|富良野|hokkaido|sapporo|niseko/.test(destination)?'snow':/大阪|神户|神戸|osaka|kobe/.test(destination)?'osaka':/冲绳|沖縄|海岛|okinawa|maldives/.test(destination)?'sea':'brand';
 const preset=themePresets.find(p=>p.id===(settings.mode==='auto'?auto:settings.preset));
 return {id:settings.mode==='custom'?'custom':preset.id,name:settings.mode==='custom'?'自定义配色':preset.name,color:settings.mode==='custom'?settings.color:preset.color};
}
const rgb=hex=>hex.slice(1).match(/../g).map(s=>parseInt(s,16));
const hex=values=>'#'+values.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');
const mix=(a,b,amount)=>hex(rgb(a).map((n,i)=>n*(1-amount)+rgb(b)[i]*amount));
const luminance=color=>rgb(color).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);
export const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
export function themePalette(theme){
 let primary=theme.color;
 // Keep even very pale custom colors usable for text and white button labels.
 while(contrast(primary,'#ffffff')<4.8)primary=mix(primary,'#000000',.08);
 return {primary,dark:mix(primary,'#000000',.5),ink:mix(primary,'#000000',.65),muted:mix(primary,'#626c74',.7),paper:theme.id==='osaka'?'#f5f3ed':mix(theme.color,'#ffffff',.965),surface:theme.id==='osaka'?'#fffdf9':mix(theme.color,'#ffffff',.99),soft:mix(theme.color,'#ffffff',.93),line:mix(primary,'#ffffff',.82),lineStrong:mix(primary,'#ffffff',.67),base:theme.color};
}
