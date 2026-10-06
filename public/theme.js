import {resolveTheme,themePalette,themePresets,normalizeTheme} from './theme-palette.js';
export {resolveTheme,themePalette,themePresets,normalizeTheme};
let faviconRequest=0,faviconColor='',faviconBlob='';
function updateRasterIcon(color){
 if(faviconColor===color)return;faviconColor=color;const request=++faviconRequest,image=new Image();
 image.onload=()=>{if(request!==faviconRequest)return;const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;canvas.getContext('2d').drawImage(image,0,0,32,32);canvas.toBlob(blob=>{if(!blob||request!==faviconRequest)return;const icon=document.querySelector('link[rel="icon"][type="image/png"]');if(!icon)return;const previous=faviconBlob;faviconBlob=URL.createObjectURL(blob);icon.href=faviconBlob;if(previous)URL.revokeObjectURL(previous);},'image/png');};
 image.src='/brand/favicon.svg?color='+color.slice(1)+'&v=3';
}
export function applyTripTheme(trip={},root=document.documentElement){
 const theme=resolveTheme(trip),p=themePalette(theme);
 const variables={'--green':p.primary,'--dark':p.dark,'--ink':p.ink,'--muted':p.muted,'--paper':p.paper,'--surface':p.surface,'--soft':p.soft,'--line':p.line,'--line-strong':p.lineStrong,'--orange':p.primary,'--brand-color':p.primary,'--hero-rgb':p.dark.slice(1).match(/../g).map(s=>parseInt(s,16)).join(' '),'--destination-image':theme.id==='osaka'?"url('/assets/osaka.jpg')":'none'};
 for(const [name,value] of Object.entries(variables))root.style.setProperty(name,value);
 root.dataset.travelTheme=theme.id;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',p.primary);
 for(const image of document.querySelectorAll('[data-brand-kind]'))image.src='/brand/'+image.dataset.brandKind+'.svg?color='+p.primary.slice(1)+'&v=3';
 const favicon=document.querySelector('link[rel="icon"][type="image/svg+xml"]');
 if(favicon)favicon.href='/brand/favicon.svg?color='+p.primary.slice(1)+'&v=3';
 updateRasterIcon(p.primary);
 return {...theme,palette:p};
}
