import {api,esc} from './shared.js';

export function createAccountUI({button,getSession,onChanged}){
 const dialog=document.createElement('dialog');
 dialog.className='profile-dialog';
 dialog.setAttribute('aria-label','个人资料');
 document.body.append(dialog);
 let busy=false;
 button.addEventListener('click',async()=>{
  if(dialog.open)return;
  dialog.innerHTML='<p role="status">正在读取个人资料…</p>';
  dialog.showModal();
  try{
   const {user}=await api('/api/profile');
   dialog.innerHTML=`<div class="profile-heading"><h2>个人资料</h2><button type="button" data-profile-close aria-label="关闭个人资料">×</button></div><form><label>登录用户名<input readonly autocomplete="username" value="${esc(user.username)}"></label><p class="profile-hint">用于登录及分享时辨认账号，在本站唯一。</p><label>显示名称<input name="displayName" autocomplete="nickname" maxlength="32" value="${esc(user.displayName)}" placeholder="你希望大家怎么称呼你"></label><p class="profile-hint">可以重名、随时修改，不必填写真实姓名。留空时使用登录用户名。</p><p class="profile-feedback" role="status" aria-live="polite"></p><div class="profile-actions"><button type="button" data-profile-close>取消</button><button type="submit" class="profile-save">保存名称</button></div></form>`;
   dialog.querySelector('[name="displayName"]').focus();
  }catch(error){dialog.innerHTML=`<div class="profile-heading"><h2>个人资料</h2><button type="button" data-profile-close aria-label="关闭个人资料">×</button></div><p role="status">${esc(error.message)}</p>`;}
 });
 dialog.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;
  const save=dialog.querySelector('[type="submit"]'),feedback=dialog.querySelector('.profile-feedback');
  save.disabled=true;feedback.textContent='正在保存…';
  try{
   const {user}=await api('/api/profile',{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':getSession().csrf},body:JSON.stringify({displayName:dialog.querySelector('[name="displayName"]').value})});
   onChanged?.(user);feedback.textContent='名称已保存。';
  }catch(error){feedback.textContent=error.message;}
  finally{save.disabled=false;busy=false;}
 });
 dialog.addEventListener('click',event=>{if((event.target===dialog||event.target.closest('[data-profile-close]'))&&!busy)dialog.close();});
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 return {close:()=>{if(dialog.open&&!busy)dialog.close();}};
}
