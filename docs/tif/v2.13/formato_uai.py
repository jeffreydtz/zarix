from pathlib import Path
from copy import deepcopy
from datetime import datetime, timezone
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

import argparse
parser=argparse.ArgumentParser(description='Aplicar portada UAI y formato a la revisión ZARIX del plan.')
parser.add_argument('input',type=Path)
parser.add_argument('output',type=Path)
parser.add_argument('--logo',type=Path,default=Path(__file__).parent/'assets/uai-logo.png')
args=parser.parse_args()
d=Document(args.input)
paragraphs=list(d.paragraphs)
anchor=next(p for p in paragraphs if p._p.xpath('.//w:br[@w:type="page"]'))
for p in paragraphs[:paragraphs.index(anchor)]:p._element.getparent().remove(p._element)

def cover(text='',size=12,bold=False,style='Normal',before=0,after=12):
 p=anchor.insert_paragraph_before(text,style)
 p.alignment=WD_ALIGN_PARAGRAPH.CENTER
 f=p.paragraph_format;f.space_before=Pt(before);f.space_after=Pt(after);f.line_spacing=1;f.keep_with_next=True
 for r in p.runs:r.font.name='Arial';r.font.size=Pt(size);r.font.bold=bold;r.font.color.rgb=RGBColor(0,0,0)
 return p
p=cover(before=14,after=28);p.add_run().add_picture(str(args.logo),width=Inches(3.5))
shape=p._p.xpath('.//wp:docPr')[0];shape.set('descr','Escudo y marca oficial de la Universidad Abierta Interamericana')
cover('Ingeniería en Sistemas',12,after=42)
cover('TRABAJO FINAL DE INGENIERÍA',11,bold=True,after=14)
cover('ZARIX',36,bold=True,style='Title',after=10)
cover('Plan de desarrollo tecnológico',22,bold=True,style='Title',after=12)
cover('Aplicación de finanzas personales',12,after=46)
cover('Autor',9,after=5)
cover('Jeffrey Dietz',15,bold=True,after=23)
cover('Profesores de referencia',9,after=6)
cover('Matías Banega\nAlejandro Sartorio',11,after=28)
cover('Rosario Santa Fe',11,after=0).paragraph_format.keep_with_next=False
# Restrict revision metadata to the existing internal control sheet.
for s in d.sections:
 s.different_first_page_header_footer=True
 h=s.header.paragraphs[0];h.clear();h.paragraph_format.tab_stops.add_tab_stop(Inches(6.85),WD_TAB_ALIGNMENT.RIGHT)
 r=h.add_run('ZARIX');r.bold=True;r.font.size=Pt(9);r.font.color.rgb=RGBColor(0,0,0)
 r=h.add_run('\tTrabajo Final de Ingeniería');r.font.size=Pt(9);r.font.color.rgb=RGBColor(0,0,0)
 f=s.footer.paragraphs[0];fields=[deepcopy(x) for x in f._p.findall(qn('w:fldSimple'))];f.clear();f.alignment=WD_ALIGN_PARAGRAPH.LEFT
 f.paragraph_format.tab_stops.add_tab_stop(Inches(6.85),WD_TAB_ALIGNMENT.RIGHT)
 r=f.add_run('Universidad Abierta Interamericana\t');r.font.size=Pt(9);r.font.color.rgb=RGBColor(0,0,0)
 for x in fields:f._p.append(x)
 for p in s.first_page_header.paragraphs:p.clear()
 for p in s.first_page_footer.paragraphs:p.clear()
for t in d.tables:
 for ri,row in enumerate(t.rows):
  for cell in row.cells:
   pr=cell._tc.get_or_add_tcPr()
   for x in list(pr.findall(qn('w:shd'))):pr.remove(x)
   shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'751C3B' if ri==0 else ('FBF7F8' if ri%2==0 else 'FFFFFF'));pr.append(shade)
   if ri==0:
    for node in cell._tc.xpath('.//w:r'):
     rp=node.find(qn('w:rPr'))
     if rp is None:rp=OxmlElement('w:rPr');node.insert(0,rp)
     for tag in ['w:color','w:b']:
      for x in list(rp.findall(qn(tag))):rp.remove(x)
     color=OxmlElement('w:color');color.set(qn('w:val'),'FFFFFF');rp.append(color);rp.append(OxmlElement('w:b'))
# No paragraph rules or inherited theme colors on titles and headings.
for style in ['Title','Subtitle','Heading 1','Heading 2','Heading 3','Heading 4']:
 d.styles[style].font.color.rgb=RGBColor(0,0,0)
for node in list(d.element.xpath('.//w:pBdr')):node.getparent().remove(node)
d.core_properties.title='ZARIX Plan de desarrollo tecnológico'
d.core_properties.modified=datetime.now(timezone.utc)
d.save(args.output)
print('Portada institucional y tablas actualizadas')
