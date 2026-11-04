import { artworkPNG } from './artwork.mjs';
let logoPromise;
function logo() {
  return logoPromise ||= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { logoPromise = null; reject(new Error('Brand image unavailable')); };
    img.src = './icons/icon-512.png';
  });
}
export function sharePrompt(language) {
  const base = language.split('-')[0];
  return ({zh:'你猜得到嗎？',en:'Can you guess it?',ja:'何かわかる？',ko:'무엇인지 맞혀 보세요!',de:'Kannst du es erraten?',fr:'Tu devines ?',es:'¿Puedes adivinarlo?',pt:'Consegue adivinhar?',ar:'هل يمكنك تخمينها؟',it:'Riesci a indovinare?'})[base] || 'Can you guess it?';
}
export async function shareCardPNG(strokes, ratio, {answer = '', language = 'en'} = {}) {
  const mark = await logo();
  await document.fonts.load('600 52px Rubik');
  await document.fonts.load('800 62px Rubik');
  const text = answer || sharePrompt(language);
  const families = ['Rubik'];
  if (/[\u0600-\u06ff]/u.test(text)) families.push('Noto Sans Arabic');
  if (/[\uac00-\ud7af]/u.test(text)) families.push('Noto Sans KR');
  if (/[\u3040-\u30ff]/u.test(text) || language === 'ja') families.push('Noto Sans JP');
  if (/[\u3400-\u9fff]/u.test(text)) families.push('GenSen Rounded');
  await Promise.all(families.map(family => document.fonts.load(`600 52px "${family}"`, text)));
  await document.fonts.ready;
  const drawing = new Image();
  drawing.src = artworkPNG(strokes, ratio);
  await drawing.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 1600; canvas.height = drawing.height + 400;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(drawing,0,0);
  const y = drawing.height;
  ctx.fillStyle = '#d4f3ee'; ctx.fillRect(0,y,1600,400);
  ctx.fillStyle = '#247680'; ctx.fillRect(0,y,1600,8);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#174b60';
  // Wrap by Unicode code points, including long custom words and CJK text.
  let lines = [], size = 52;
  for (;size>=24;size-=2) {
    ctx.font = `600 ${size}px ${families.map(family => `"${family}"`).join(', ')}, sans-serif`;
    lines=[];let line='';
    for(const char of Array.from(text)) {
      if(ctx.measureText(line+char).width>1440 && line){lines.push(line);line='';}
      line+=char;
    }
    if(line)lines.push(line);
    if(lines.length<=3)break;
  }
  ctx.direction = language.startsWith('ar') ? 'rtl' : 'ltr';
  lines.forEach((line,i)=>ctx.fillText(line,800,y+95+(i-(lines.length-1)/2)*(size+10)));
  ctx.direction = 'ltr'; ctx.textAlign='left';
  ctx.save(); ctx.beginPath(); ctx.roundRect(435,y+225,120,120,24); ctx.clip();
  ctx.drawImage(mark,435,y+225,120,120); ctx.restore();
  ctx.font='800 62px Rubik, sans-serif';ctx.fillText('Sketch & Guess',590,y+285);
  return canvas.toDataURL('image/png');
}

// Deliberately render public results, never a screenshot of secret cards or licensed GUI.
export async function scoreCardPNG({language='en', title, headline, entries, caption}) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 12) throw new Error('Invalid score rows');
  const mark = await logo();
  const text = [title,headline,caption,...entries.map(e=>e.name)].join(' ');
  const families=['Rubik'];
  if (/[\u0600-\u06ff]/u.test(text)) families.push('Noto Sans Arabic');
  if (/[\uac00-\ud7af]/u.test(text)) families.push('Noto Sans KR');
  if (/[\u3040-\u30ff]/u.test(text)||language==='ja') families.push('Noto Sans JP');
  if (/[\u3400-\u9fff]/u.test(text)) families.push('GenSen Rounded');
  await Promise.all(families.map(f=>document.fonts.load(`600 48px "${f}"`,text)));
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=entries.length<=6?1600:2000;
  const height=canvas.height;
  const ctx=canvas.getContext('2d');
  const bg=ctx.createLinearGradient(0,0,1600,height);bg.addColorStop(0,'#c6f4ee');bg.addColorStop(1,'#fef2cd');
  ctx.fillStyle=bg;ctx.fillRect(0,0,1600,height);
  const panel=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,32);ctx.fill()};
  const rtl=language.startsWith('ar');
  const fit=(value,x,y,width,size=52,align='center')=>{
    value=String(value);ctx.textAlign=align;ctx.textBaseline='middle';ctx.direction=rtl?'rtl':'ltr';
    do {ctx.font=`600 ${size}px ${families.map(f=>`"${f}"`).join(',')},sans-serif`;if(ctx.measureText(value).width<=width)break;size-=2;}while(size>20);
    // At the minimum size retain full text via two lines, never silently truncate names.
    if(ctx.measureText(value).width>width){let line='',lines=[];for(const char of Array.from(value)){if(ctx.measureText(line+char).width>width&&line){lines.push(line);line=''}line+=char}lines.push(line);lines.forEach((v,i)=>ctx.fillText(v,x,y+(i-(lines.length-1)/2)*26));}
    else ctx.fillText(value,x,y);
  };
  ctx.fillStyle='#174b60';fit(title,800,125,1400,76);
  ctx.fillStyle='#986013';fit(headline,800,235,1400,54);
  const area=height-680,rowHeight=Math.min(180,area/entries.length), start=330+(area-rowHeight*entries.length)/2;
  entries.forEach((entry,i)=>{
    const y=start+i*rowHeight,rank=entries.findIndex(e=>e.score===entry.score)+1;
    const leading=rank===1 && Number(entry.score)>0;
    panel(90,y+5,1420,rowHeight-14,leading?'#ffe59c':'#ffffff');
    panel(120,y+rowHeight/2-32,64,64,leading?'#ad6915':'#247680');
    ctx.fillStyle='#fff';fit(entries.length===1?'★':rank,152,y+rowHeight/2,56,34);
    ctx.fillStyle='#174b60';fit(entry.name,rtl?1180:215,y+rowHeight/2,950,entries.length>8?42:56,rtl?'right':'left');
    ctx.fillStyle='#174b60';fit(entry.score,1350,y+rowHeight/2,230,68);
  });
  ctx.fillStyle='#174b60';fit(caption,800,height-265,1400,38);
  panel(0,height-190,1600,190,'#174b60');
  ctx.save();ctx.beginPath();ctx.roundRect(405,height-160,128,128,26);ctx.clip();ctx.drawImage(mark,405,height-160,128,128);ctx.restore();
  ctx.direction='ltr';ctx.textAlign='left';ctx.fillStyle='#fff';ctx.font='800 64px Rubik,sans-serif';ctx.fillText('Sketch & Guess',570,height-96);
  return canvas.toDataURL('image/png');
}
