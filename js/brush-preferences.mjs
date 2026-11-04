export const penColors = ['#243450','#ef6a59','#4589e3','#35a785','#ebae35','#9b72d4','#f38db8','#ef8735','#805637','#8e9ba8','#30bfd0','#ffffff'];
const extraNames = {en:['Pink','Orange','Brown','Grey','Cyan','White'],zh:['粉紅色','橙色','啡色','灰色','青色','白色'],ja:['ピンク','オレンジ','茶色','灰色','水色','白'],ko:['분홍색','주황색','갈색','회색','청록색','흰색'],fr:['Rose','Orange','Marron','Gris','Cyan','Blanc'],de:['Rosa','Orange','Braun','Grau','Türkis','Weiß'],es:['Rosa','Naranja','Marrón','Gris','Cian','Blanco'],pt:['Rosa','Laranja','Castanho','Cinzento','Ciano','Branco'],ar:['وردي','برتقالي','بني','رمادي','سماوي','أبيض'],it:['Rosa','Arancione','Marrone','Grigio','Ciano','Bianco']};
export const extraPenNames = language => extraNames[language.split('-')[0]] || extraNames.en;
// Brush selection belongs only to the current drawing session, never storage.
export const defaultBrush = () => ({color:penColors[0],width:7,eraser:false});
