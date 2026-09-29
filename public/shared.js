export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const labels={walk:'漫步',transport:'交通',flight:'航班',hotel:'酒店',admission:'门票',food:'餐饮',visit:'参观',service:'服务',shopping:'购物',event:'活动',museum:'展馆',other:'其他',planned:'计划',confirmed:'已确认',optional:'备选',done:'已完成',pending:'待确认',cancelled:'已取消'};
export const safeUrl=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
export const mapUrl=q=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q);
export async function api(path,options={}){const res=await fetch(path,options);const data=await res.json();if(!res.ok){const err=new Error(data.error||'请求失败');err.status=res.status;throw err;}return data;}
export async function requireSession(){const s=await api('/api/session');if(!s.authenticated){location.replace('/login?next='+encodeURIComponent(location.pathname==='/admin'?'/admin':'/'));throw new Error('请先登录');}return s;}
export function downloadJson(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
