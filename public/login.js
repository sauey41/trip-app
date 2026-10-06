import {api,safeLoginNext} from './shared.js';
import {applyTripTheme} from './theme.js';
applyTripTheme();
const form=document.querySelector('#login'),error=document.querySelector('#error'),intro=document.querySelector('#login-intro'),heading=document.querySelector('.login-card h1');
const next=safeLoginNext(new URLSearchParams(location.search).get('next')||'/');
let mode=location.pathname==='/register'?'register':'login',configured=false,needsOwnerClaim=false;

function draw(){
 let title,description,button,confirm='';
 if(!configured){
  title='第一次出发，<br><em>建立管理员账号。</em>';
  description='设置唯一的登录用户名与密码，另外选择你喜欢的显示名称。';button='建立账号并进入';
  confirm='<label>再次输入密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="512" required></label>';
 }else if(needsOwnerClaim){
  title='升级账号，<br><em>行程继续。</em>';
  description='为现有管理密码指定登录用户名和显示名称。原密码继续使用。';button='确认管理员账号';
 }else if(mode==='register'){
  title='加入旅途，<br><em>留下你的故事。</em>';
  description='登录用户名在本站唯一；显示名称可以重名，不必填写真实姓名。注册后由管理员批准。';button='注册';
  confirm='<label>再次输入密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="512" required></label>';
 }else{
  title='下一站，<br><em>我们一起。</em>';
  description='用登录用户名进入，查看行程并记录旅途。';button='登录';
 }
 const creating=!configured||needsOwnerClaim||mode==='register';
 const nickname=creating?'<label>显示名称（可选）<input name="displayName" autocomplete="nickname" maxlength="32" placeholder="你希望大家怎么称呼你"></label><small>可随时在个人资料中修改，不必填写真实姓名。</small>':'';
 heading.innerHTML=title;intro.textContent=description;
 const actions=configured&&!needsOwnerClaim?(mode==='register'?`<button type="button" data-mode="login">登录</button><button class="primary" type="submit">${button}</button>`:`<button class="primary" type="submit">${button}</button><button type="button" data-mode="register">注册</button>`):`<button class="primary" type="submit">${button}</button>`;
 form.innerHTML=`<label>登录用户名<input name="username" autocomplete="username" minlength="2" maxlength="32" required autofocus></label>${creating?'<small>本站唯一；大小写与全角、半角等价。无需填写真实姓名。</small>':''}${nickname}<label>密码<input name="password" type="password" autocomplete="${creating?'new-password':'current-password'}" minlength="12" maxlength="512" required></label>${confirm}<div class="account-actions">${actions}</div>`;
}

form.addEventListener('click',event=>{
 const target=event.target.closest('[data-mode]');if(!target)return;
 mode=target.dataset.mode;
 history.replaceState(null,'',(mode==='register'?'/register':'/login')+(next!=='/'?'?next='+encodeURIComponent(next):''));
 error.textContent='';error.classList.remove('success');draw();
});
try{
 const state=await api('/api/session');
 if(state.authenticated)location.replace(state.role==='owner'?next:next==='/admin'?'/':next);
 else{configured=state.configured;needsOwnerClaim=state.needsOwnerClaim;draw();}
}catch(e){error.textContent=e.message;}

form.addEventListener('submit',async event=>{
 event.preventDefault();const button=form.querySelector('button[type="submit"]');button.disabled=true;
 error.textContent='';error.classList.remove('success');
 try{
  const username=form.elements.username.value.trim(),password=form.elements.password.value,confirmPassword=form.elements.confirmPassword?.value,displayName=form.elements.displayName?.value;
  if(confirmPassword!==undefined&&password!==confirmPassword)throw new Error('两次输入的密码不一致');
  if(!configured){await api('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,confirmPassword})});configured=true;needsOwnerClaim=true;}
  if(needsOwnerClaim){
   await api('/api/owner/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,confirmPassword:password,displayName})});needsOwnerClaim=false;
  }else if(mode==='register'){
   await api('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,confirmPassword,displayName})});
   mode='login';history.replaceState(null,'','/login'+(next!=='/'?'?next='+encodeURIComponent(next):''));draw();
   form.elements.username.value=username;error.classList.add('success');error.textContent='注册申请已提交，请等待管理员批准。';return;
  }
  const result=await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  location.replace(result.role==='owner'?next:next==='/admin'?'/':next);
 }catch(e){error.textContent=e.message;}
 finally{button.disabled=false;}
});
