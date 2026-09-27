import {api} from './shared.js';
const error=document.querySelector('#error'),next=new URLSearchParams(location.search).get('next')==='/admin'?'/admin':'/';
api('/api/session').then(s=>{if(s.authenticated)location.replace(next);else if(!s.configured){error.textContent='首次部署：请设置至少 12 位的 ADMIN_PASSWORD 环境变量，并重新启动容器。';document.querySelector('button').disabled=true;}}).catch(e=>error.textContent=e.message);
document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;error.textContent='';try{await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:e.target.password.value})});location.replace(next);}catch(e){error.textContent=e.message;b.disabled=false;}});
