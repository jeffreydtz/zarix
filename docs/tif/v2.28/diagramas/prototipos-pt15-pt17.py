from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

OUT=Path(__file__).resolve().parent.parent/'figures';OUT.mkdir(exist_ok=True)
FONT='/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
BOLD='/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
W=1300
C={'ink':'#183044','muted':'#556675','line':'#b8c3cc','blue':'#e7f2fa','green':'#e9f6ef','amber':'#fff4dc','red':'#ffebeb','bg':'#f5f7f9'}
F={k:ImageFont.truetype(BOLD if k in ['title','head','label'] else FONT,n) for k,n in [('title',40),('head',30),('label',25),('body',30),('small',26)]}

def lines(draw,text,font,width):
 out=[]
 for para in text.split('\n'):
  words=para.split();line=''
  for word in words:
   trial=(line+' '+word).strip()
   if draw.textlength(trial,font=font)>width and line:out.append(line);line=word
   else:line=trial
  out.append(line)
 return out

def draw_text(draw,x,y,text,font,width,color=None):
 for line in lines(draw,text,font,width):
  draw.text((x,y),line,font=font,fill=color or C['ink']);y+=font.size+10
 return y

PROTOS=[
 ('PT15','Resumen de tarjeta','CU-003 A07 · RF20 · desde el Dashboard o la ficha de la cuenta',[
  ('fields','Visa de ejemplo · próximo resumen',[('Cierre','28/11/2026'),('Vencimiento','10/12/2026'),('Monto estimado ARS','120.000,00'),('Monto estimado USD','80,00 (no se convierte a ARS)')]),
  ('rows','Ciclos (seis)',['Nov 2026 · cargos ARS 120.000 · cuota 1/6 · USD 80 (suscripción)','Dic 2026 · cargos ARS 120.000 · cuota 2/6','Ene 2027 a Abr 2027 · cuotas 3/6 a 6/6 · ARS 120.000 cada una']),
  ('rows','Cuotas pendientes',['Heladera de ejemplo · 6 × ARS 120.000 · restan 5 · deuda futura ARS 600.000']),
  ('buttons','',['Ver movimientos del ciclo','Volver a la cuenta']),
  ('state','Estados','Tarjeta sin cargos: “Todavía no hay consumos en este ciclo”.\nCiclo sólo en USD: se rotula USD y no se suma a pesos.\nCuenta ajena o que no es tarjeta: “Sin datos para esta cuenta”.')]),
 ('PT16','Rendimiento real: patrimonio líquido e inversiones','CU-003 A08 · RF21 · Dashboard e Inversiones',[
  ('buttons','Período',['Mes','Trimestre','Año','Desde el inicio']),
  ('fields','Patrimonio líquido · Trimestre 12/08 → 10/11/2026 (90 días)',[('Nominal','+8,0 %'),('Real vs IPC','+2,1 %'),('vs MEP / vs CCL','+1,2 % / −0,4 % (diferencia en puntos)')]),
  ('fields','Inversiones (nominal en USD; real frente al IPC en ARS)',[('Nominal','+3,5 %'),('Real vs IPC','−2,2 %'),('vs MEP / vs CCL','−3,1 % / −4,0 % (diferencia en puntos)')]),
  ('rows','Referencias, cada una con fuente y fecha',['Inflación INDEC +5,8 % · MEP · CCL','Plazo fijo · TNA cargada por el usuario · interés simple del período','Caución y FCI de mercado de dinero · valor o “No disponible”']),
  ('buttons','',['Configurar referencias']),
  ('state','Estados','Sin registro de patrimonio al inicio del período: “—” y “Sin snapshots suficientes en este período”.\nSin meses de IPC publicados en el intervalo: inflación “No disponible”; nunca se usa 0 %.\nAviso: comparación informativa, no es una recomendación de inversión.')]),
 ('PT17','Carga de resúmenes y buzón de correo','CU-001 A14 · RF22 · desde Integraciones',[
  ('fields','Subir resumen',[('Archivo','resumen-octubre.csv · PDF o CSV hasta 4 MB'),('Cuenta destino','Visa de ejemplo')]),
  ('buttons','',['Procesar archivo']),
  ('rows','Resultado',['10 ítems estacionados en la bandeja de pendientes','1 posible duplicado (mismo importe y moneda, fecha cercana y comercio compatible, últimos 120 días)','1 cuota ya cargada (2/3) · nada se registró sin confirmar · Ir a la bandeja (P13)']),
  ('fields','Buzón de correo',[('Dirección personal','zrxm_••••••@… · se muestra completa una sola vez'),('Estado','Activo · Revocar')]),
  ('state','Estados','Sin archivo, cuenta ajena o archivo mayor a 4 MB, o PDF de más de 20 páginas: rechazo con el motivo.\nMismo archivo repetido: “Ya estaban en la bandeja”, sin duplicar.\nBuzón sin configurar o correo sin el secreto: el correo se rechaza y no crea ítems.')]),
]

manifest=[]
for ident,title,coverage,sections in PROTOS:
 canvas=Image.new('RGB',(W,2500),'white');draw=ImageDraw.Draw(canvas)
 draw.rectangle((0,0,W,12),fill=C['ink'])
 draw.rounded_rectangle((55,40,1245,112),radius=12,fill=C['blue'])
 draw.text((78,56),f'{ident}  ·  PROTOTIPO DOCUMENTAL — DISEÑO',font=F['head'],fill=C['ink'])
 y=draw_text(draw,60,142,title,F['title'],1180)
 y=draw_text(draw,60,y+12,coverage,F['small'],1180,C['muted'])+30
 for typ,label,content in sections:
  if label:y=draw_text(draw,60,y,label,F['head'],1180)+12
  if typ=='fields':
   for i in range(0,len(content),2):
    row=content[i:i+2]; heights=[]
    for k,v in row:
     heights.append(27+35+len(lines(draw,v,F['body'],520))*40+25)
    h=max(heights)
    for col,(k,v) in enumerate(row):
     x=60+col*600
     draw.rounded_rectangle((x,y,x+580,y+h),radius=10,outline=C['line'],width=2,fill=C['bg'])
     draw_text(draw,x+20,y+16,k,F['label'],540,C['muted'])
     draw_text(draw,x+20,y+55,v,F['body'],540)
    y+=h+14
  elif typ=='rows':
   for text in content:
    h=len(lines(draw,text,F['body'],1115))*40+28
    draw.rounded_rectangle((60,y,1240,y+h),radius=8,outline=C['line'],width=2)
    draw_text(draw,80,y+12,text,F['body'],1130)
    y+=h+10
  elif typ=='buttons':
   x=60
   for t in content:
    w=int(draw.textlength(t,font=F['label']))+45
    if x+w>1240:x=60;y+=65
    draw.rounded_rectangle((x,y,x+w,y+56),radius=10,outline=C['ink'],width=2,fill=C['blue'])
    draw.text((x+20,y+13),t,font=F['label'],fill=C['ink']);x+=w+18
   y+=76
  elif typ=='state':
   h=len(lines(draw,content,F['small'],1125))*36+32
   draw.rounded_rectangle((60,y,1240,y+h),radius=10,fill=C['amber'],outline=C['line'],width=2)
   draw_text(draw,80,y+15,content,F['small'],1130);y+=h+18
  y+=18
 footer='Datos sintéticos · Especificación de controles y estados · No es captura del producto'
 draw.line((60,y,1240,y),fill=C['line'],width=2)
 y=draw_text(draw,60,y+15,footer,F['small'],1180,C['muted'])+30
 if y>2500:raise ValueError(f'{ident} overflow {y}')
 canvas=canvas.crop((0,0,W,y))
 fn=OUT/f'{ident}.png';canvas.save(fn,dpi=(200,200))
 manifest.append({'id':ident,'title':title,'coverage':coverage,'path':f'figures/{ident}.png','width':W,'height':y,'kind':'Prototipo documental, diseño con datos sintéticos'})
(OUT/'prototipos_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps([{'id':m['id'],'height':m['height']} for m in manifest]))
