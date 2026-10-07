from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

OUT=Path(__file__).parent.parent/'figures';OUT.mkdir(exist_ok=True)
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
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
 ('PT01','Gestionar movimientos','CU-001 básico, A01 y A08',[
  ('fields','Nuevo movimiento',[('Tipo','Gasto'),('Cuenta','Banco · ARS'),('Monto','1.500,00'),('Fecha','06/10/2026'),('Categoría','Alimentos'),('Descripción opcional','Compra semanal · máximo 200 caracteres')]),
  ('rows','Antes de confirmar',['Saldo actual ARS 10.000,00 → saldo previsto ARS 8.500,00','Transferencia: elegir origen y destino propios, moneda de monto y tasa dirigida.','Editar/eliminar: mostrar efecto anterior y pedir confirmación.']),
  ('buttons','',['Confirmar movimiento','Cancelar']),
  ('state','Error / resultado','Monto cero o dato inválido: indicar el campo y conservar el formulario.\nConfirmado: ID del movimiento, saldo y registro visible en el listado.')]),
 ('PT02','Captura e importación','CU-001 A02 y A04',[
  ('fields','Ticket: revisar propuesta',[('Archivo','ticket-ejemplo.png · JPG/PNG hasta 5 MiB'),('Comercio','Mercado de ejemplo'),('Fecha','06/10/2026'),('Total propuesto','1.500,00 → corregido a 1.600,00'),('Cuenta','Banco · ARS'),('Categoría','Alimentos')]),
  ('buttons','',['Confirmar gasto revisado','Carga manual']),
  ('rows','Importación CSV / JSON: vista previa',['Fila 1 · gasto 500 · válida','Fila 2 · ingreso 700 · válida','Fila 3 · gasto 0 · rechazada: monto debe ser positivo','Mapear cuentas/categorías y revisar posibles duplicados antes de confirmar.']),
  ('state','Resultado por archivo','2 filas importadas, 1 rechazada. Saldo de 10.000 a 10.200.\nOCR fallido: conservar alternativa manual; no registrar antes de confirmar.')]),
 ('PT03','Conversación Telegram','CU-001 A03 y CU-003 A03',[
  ('rows','Borrador conversacional',['Tú: “Gasté 1.500 en alimentos desde Banco.”','ZARIX: Gasto · Banco ARS · 1.500 · Alimentos · 06/10/2026','ZARIX: “Revisá los datos y confirmá.”','Si falta cuenta, categoría o moneda: preguntar antes de registrar.']),
  ('buttons','',['Confirmar','Corregir','Cancelar']),
  ('rows','Resultado y consulta',['Confirmado: movimiento M-ejemplo, saldo ARS 8.500.','Consulta: “¿Cuánto gasté en Alimentos del 1 al 6 de octubre?”','Respuesta: ARS 2.000 · período 01/10–06/10 · datos propios.']),
  ('state','Acceso y contingencia','Sin vínculo: mostrar cómo vincular desde Configuración, sin datos financieros.\nVínculo revocado o servicio fallido: informar el estado y ofrecer acceso por PWA.')]),
 ('PT04','Recurrentes y presupuestos','CU-001 A05, A06 y A07',[
  ('fields','Regla recurrente',[('Tipo / monto','Gasto · ARS 1.000'),('Cuenta / categoría','Banco · Alimentos'),('Frecuencia','Diaria'),('Inicio / fin','01/10/2026 · sin fin'),('Estado','Activa'),('Última ejecución','06/10/2026')]),
  ('buttons','',['Guardar regla','Suspender']),
  ('fields','Presupuesto mensual',[('Mes / categoría','Octubre 2026 · Alimentos'),('Moneda / límite','ARS · 1.000'),('Consumido / disponible','700 / 300'),('Estado','70% consumido')]),
  ('state','Estados alternativos','Cuenta archivada: no generar un movimiento nuevo. Fin vencido: regla inactiva.\nFallo técnico: mostrar error de ejecución; un aviso fallido no revierte dinero.\nPresupuesto 1.100 consumido: exceso 100, sin bloquear un gasto válido.')]),
 ('PT05','Administrar cuentas','CU-002 básico y A01–A03',[
  ('fields','Nueva cuenta',[('Nombre','Banco de ejemplo'),('Tipo','Banco'),('Moneda','ARS'),('Saldo inicial','10.000,00'),('Incluir en totales','Sí'),('Incluir en líquido','Sí')]),
  ('buttons','',['Crear cuenta','Cancelar']),
  ('rows','Tarjeta y archivo',['Tarjeta bimoneda: mostrar ARS y USD por separado, deuda negativa o crédito a favor.','Archivo: conservar movimientos; la cuenta deja el listado activo.','Restaurar: recuperar visibilidad y permitir nuevos registros.','Cuenta con movimientos: no cambiar moneda ni modo bimoneda.']),
  ('state','Plan y error','Free: hasta tres cuentas activas. Cuarta cuenta: informar límite del plan.\nDatos inválidos o cuenta ajena: rechazo sin modificar otra cuenta.')]),
 ('PT06','Acceso, preferencias y datos','CU-002 A04–A07',[
  ('fields','Configuración personal',[('Moneda base','ARS / USD'),('Widgets','Patrimonio · Cotizaciones · Últimos movimientos'),('Telegram','Vincular con código de un solo uso / Revocar'),('Plan','Ver precio y período del catálogo')]),
  ('buttons','',['Guardar preferencias','Exportar mis datos']),
  ('rows','Exportación y sesión',['Exportación disponible en Free: elegir período y CSV o JSON.','Inicio: correo y contraseña; recuperación con mensaje seguro.','Cerrar sesión: finalizar acceso a pantallas protegidas.']),
  ('state','Pago y contingencia','Pendiente: no confirmar activación de Premium.\nAprobado: mostrar período verificado; rechazado/vencido: estado explícito.\nExportación fallida permite reintento; código Telegram vencido requiere otro.')]),
 ('PT07','Patrimonio y análisis','CU-003 básico, A01, A04 y A05',[
  ('fields','Dashboard: fixture sintético',[('Cuenta ARS','120.000,00'),('Cuenta USD','100,00'),('Referencia usada','1 USD = 1.200 ARS'),('Patrimonio total','ARS 240.000 / USD 200')]),
  ('rows','Detalle y filtros',['Referencia blue · fecha/hora visibles · compra/venta según dirección.','Filtrar período, cuenta y categoría; transferencias no son ingreso ni gasto.','Anomalía: gasto actual 2.000 / promedio previo 1.000 = ratio 2.','Proyección: efectivo ARS 2.000 + ahorro mensual 300; 3/6/12 meses = 2.900/3.800/5.600.']),
  ('buttons','',['Ver componentes','Cambiar widgets']),
  ('state','Vacío / parcial / respaldo','Sin historial: invitar a crear cuenta o registrar movimiento.\nProveedor fallido: referencia de respaldo con fecha; sin tasa: componente no convertible.\nSin mes completo con actividad: no presentar proyección completa.')]),
 ('PT08','Consulta con asistente','CU-003 A02 y derivación a CU-001',[
  ('rows','Consulta propia',['Tú: “¿Cuánto gasté en Alimentos del 1 al 6 de octubre de 2026?”','Interpretación: gasto · Alimentos · 01/10–06/10 inclusive.','Resultado: ARS 2.000. Origen: registros de 500, 700 y 800.','No incluye septiembre ni movimientos de otra persona.']),
  ('fields','Nueva pregunta',[('Consulta','Escribí una pregunta sobre tus datos'),('Filtros interpretados','Período, cuenta y categoría visibles')]),
  ('buttons','',['Consultar','Abrir filtros']),
  ('state','Ambigüedad / registro / fallo','“El mes pasado”: pedir o mostrar período exacto antes de responder.\n“Registrar un gasto”: abrir propuesta y confirmación de CU-001.\nModelo no disponible: ofrecer consulta convencional, sin cifra inventada.')]),
 ('PT09','Portafolio y venta','CU-004 básico y A01–A03',[
  ('fields','Posición de ejemplo',[('Cuenta / activo','Broker · activo USA'),('Cantidad restante','6 unidades'),('Precio de compra','USD 100 por unidad'),('Precio de referencia','USD 110 · fecha visible'),('Valor / no realizado','USD 660 / USD +60'),('Realizado anterior','USD +80 por venta de 4 a 120')]),
  ('buttons','',['Registrar posición','Registrar venta']),
  ('rows','Venta o precio manual',['Venta: cantidad, precio, moneda y fecha; mostrar tenencia disponible.','Activo manual: etiqueta manual y fecha del precio.','Registrar una operación externa no ejecuta una orden de mercado ni mueve efectivo automáticamente.']),
  ('state','Rechazos y ausencia','Vender 7 con tenencia 6: rechazar y conservar cantidad/costo.\nFallo de persistencia: conservar posición e historial.\nSin referencia: señalar respaldo o ausencia, no una pérdida cierta a cero.')]),
 ('PT10','Simular escenario','CU-004 A04',[
  ('fields','Supuesto de simulación',[('Posición','6 unidades'),('Precio real de referencia','USD 110'),('Variación','+10%'),('Precio hipotético','USD 121'),('Valor real','USD 660'),('Valor hipotético','USD 726')]),
  ('buttons','',['Calcular simulación','Volver al portafolio']),
  ('rows','Comparación',['Cambio estimado: +USD 66 bajo el supuesto elegido.','Fuente y fecha del precio real visibles.','La simulación no modifica cantidad, precio registrado, saldos ni ventas.','No ofrece guardar el escenario como compra o venta real.']),
  ('state','Error y limitación','Entrada no numérica: corregir porcentaje.\nPrecio ausente: indicar componente no simulable.\nEs una comparación hipotética, no recomendación de inversión.')]),
 ('PT11','Gastos compartidos','CU-001 A09 · Usuario / Invitado con enlace',[
  ('fields','Grupo de ejemplo',[('Grupo / moneda','Cena · ARS'),('Miembros visibles','Ana · Bruno · Caro'),('Pagó / gasto','Ana · 100,00'),('Reparto igual','Ana 33,34 · Bruno 33,33 · Caro 33,33')]),
  ('rows','Balances y liquidación sugerida',['Ana: le deben 66,66. Bruno: debe 33,33. Caro: debe 33,33.','Sugerencia: Bruno→Ana 33,33 y Caro→Ana 33,33.','El invitado entra por enlace activo y selecciona su miembro del grupo.','El reparto no cambia cuentas personales ni ejecuta pagos.']),
  ('buttons','',['Agregar gasto','Editar gasto','Ver reparto']),
  ('state','Límite de acceso','Enlace inválido/inactivo: grupo no encontrado, sin datos financieros.\nMiembro o pagador ajeno: rechazar operación.\nLa vista del grupo no expone correo/teléfono ni patrimonio del dueño.')]),
 ('PT12','Cuotas y borradores pendientes','CU-001 A10 y A11',[
  ('fields','Compra en cuotas',[('Cuenta / moneda','Tarjeta · ARS'),('Importe total','600,00'),('Número de cuotas','3'),('Importe por cuota','200,00'),('Fechas ilustrativas','06/10 · 06/11 · 06/12/2026'),('Suma de cuotas','600,00')]),
  ('buttons','',['Confirmar cuotas','Cancelar']),
  ('rows','Cola local sin conexión',['1 borrador pendiente: gasto ARS 1.500 en Banco.','Pendiente de sincronización: no representa confirmación financiera.','Al recuperar conexión: validar identidad y datos, luego mostrar resultado.','No marcar registrado sólo porque el borrador quedó guardado localmente.']),
  ('state','Entrada / sincronización','Cuotas: de 2 a 36, misma moneda que la cuenta; otra moneda se rechaza.\nSin sesión al sincronizar: recuperar acceso.\nReintento o doble envío: probar garantía de idempotencia de ese canal.')]),
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
 manifest.append({'id':ident,'title':title,'coverage':coverage,'path':str(fn.resolve()),'width':W,'height':y,'kind':'Prototipo documental, diseño con datos sintéticos'})
(OUT/'prototipos_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps([{'id':m['id'],'height':m['height']} for m in manifest]))
