export function wireAttachmentPreview(){
 const dialog=document.createElement('dialog');dialog.className='attachment-preview';
 const header=document.createElement('div');header.className='preview-header';
 const title=document.createElement('h2');
 const close=document.createElement('button');close.type='button';close.textContent='关闭';close.addEventListener('click',()=>dialog.close());
 header.append(title,close);
 const body=document.createElement('div');body.className='preview-body';
 const download=document.createElement('a');download.className='map-link';download.textContent='下载原文件';
 dialog.append(header,body,download);document.body.append(dialog);
 dialog.addEventListener('close',()=>body.replaceChildren());
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-preview]');if(!button)return;
  const id=button.dataset.preview;if(!/^[a-f0-9-]{36}\.(pdf|png|jpg)$/.test(id))return;
  title.textContent=button.dataset.name||'附件预览';download.href='/api/attachments/'+id;
  const media=document.createElement(id.endsWith('.pdf')?'iframe':'img');media.src='/api/previews/'+id;
  if(media.tagName==='IFRAME')media.title=title.textContent;else media.alt=title.textContent;
  body.replaceChildren(media);dialog.showModal();
 });
}
