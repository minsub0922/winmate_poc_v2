# build/fixtures/my_sample.pptx — test deck for the My 템플릿 import (python-pptx):
# 1 title + subtitle (placeholders, theme fonts), 2 shapes · gradient · group · arrow connector · cropped photo,
# 3 table + column chart, 4 bullets (levels, numbering), 5 hidden slide
import sys
from pptx import Presentation
from pptx.util import Emu, Pt, Inches
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn

out, photo = sys.argv[1], sys.argv[2]
prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLUE = RGBColor(0x14, 0x28, 0xA0)

def font(run, size, bold=False, color=None, face='Noto Sans KR'):
    run.font.size = Pt(size); run.font.bold = bold; run.font.name = face
    if color: run.font.color.rgb = color

# 1 — title slide (placeholders)
s = prs.slides.add_slide(prs.slide_layouts[0])
s.shapes.title.text = '스마트 매장 디지털 전환 제안'
s.placeholders[1].text = 'A 커피 프랜차이즈 · 2026년 10월'

# 2 — shapes
s = prs.slides.add_slide(prs.slide_layouts[6])
tb = s.shapes.add_textbox(Inches(0.6), Inches(0.4), Inches(9), Inches(0.8))
p = tb.text_frame.paragraphs[0]; r = p.add_run(); r.text = '매장 운영을 바꾸는 세 가지 방법'; font(r, 28, True, RGBColor(0x12, 0x14, 0x17))
for i, (label, col) in enumerate([('본사 통합 운영', BLUE), ('저전력 자동화', RGBColor(0x0B, 0x6E, 0x64)), ('데이터 기반 판촉', RGBColor(0x5B, 0x35, 0xC4))]):
    sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.6 + i * 3.2), Inches(1.6), Inches(2.9), Inches(1.4))
    sh.fill.solid(); sh.fill.fore_color.rgb = col; sh.line.fill.background()
    tf = sh.text_frame; tf.paragraphs[0].alignment = PP_ALIGN.CENTER; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    r = tf.paragraphs[0].add_run(); r.text = label; font(r, 18, True, RGBColor(0xFF, 0xFF, 0xFF))
grad = s.shapes.add_shape(MSO_SHAPE.CHEVRON, Inches(0.6), Inches(3.4), Inches(3), Inches(1))
grad.fill.gradient(); grad.fill.gradient_angle = 0
grad.fill.gradient_stops[0].color.rgb = BLUE; grad.fill.gradient_stops[1].color.rgb = RGBColor(0x93, 0xA6, 0xFF)
c = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(3.8), Inches(3.9), Inches(6), Inches(3.9))
c.line.color.rgb = RGBColor(0x59, 0x61, 0x70); c.line.width = Pt(2)
ln = c.line._get_or_add_ln(); te = ln.makeelement(qn('a:tailEnd'), {'type': 'triangle'}); ln.append(te)
g = s.shapes.add_group_shape()
o = g.shapes.add_shape(MSO_SHAPE.OVAL, Inches(6.3), Inches(3.4), Inches(1), Inches(1)); o.fill.solid(); o.fill.fore_color.rgb = RGBColor(0xE8, 0x89, 0x0C); o.line.fill.background()
t = g.shapes.add_shape(MSO_SHAPE.ISOSCELES_TRIANGLE, Inches(7.5), Inches(3.4), Inches(1), Inches(1)); t.fill.solid(); t.fill.fore_color.rgb = RGBColor(0xB4, 0x23, 0x18); t.line.fill.background()
pic = s.shapes.add_picture(photo, Inches(9), Inches(1.6), Inches(3.8), Inches(3.2))
pic.crop_left = 0.1; pic.crop_right = 0.1
tb = s.shapes.add_textbox(Inches(0.6), Inches(5.2), Inches(12), Inches(1))
p = tb.text_frame.paragraphs[0]; r = p.add_run(); r.text = '출처: 사내 도입 사례 · '; font(r, 12, False, RGBColor(0x59, 0x61, 0x70))
r = p.add_run(); r.text = '굵은 강조'; font(r, 12, True, BLUE)

# 3 — table + chart
s = prs.slides.add_slide(prs.slide_layouts[5])
s.shapes.title.text = '도입 전후 비교'
tbl = s.shapes.add_table(4, 3, Inches(0.6), Inches(1.8), Inches(6), Inches(2.4)).table
for ri, row in enumerate([('항목', '도입 전', '도입 후'), ('메뉴 교체', '9일', '당일'), ('전력', '100%', '72%'), ('장애 확인', '현장 방문', '원격')]):
    for ci, v in enumerate(row): tbl.cell(ri, ci).text = v
cd = CategoryChartData(); cd.categories = ['1분기', '2분기', '3분기', '4분기']
cd.add_series('매출', (12.5, 14.1, 15.8, 18.2)); cd.add_series('비용', (9.1, 8.7, 8.2, 7.9))
ch = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(7), Inches(1.8), Inches(5.8), Inches(4), cd).chart
ch.has_legend = True; ch.legend.position = XL_LEGEND_POSITION.BOTTOM; ch.legend.include_in_layout = False

# 4 — bullets
s = prs.slides.add_slide(prs.slide_layouts[1])
s.shapes.title.text = '실행 계획'
tf = s.placeholders[1].text_frame
tf.text = '파일럿 10개 매장'
for txt, lvl in [('메뉴보드 3면 · 키오스크 2대', 1), ('본사 CMS 연동', 1), ('전국 확산', 0), ('지역별 단계 도입', 1)]:
    p = tf.add_paragraph(); p.text = txt; p.level = lvl

# 5 — hidden
s = prs.slides.add_slide(prs.slide_layouts[5])
s.shapes.title.text = '숨긴 장 — 참고 자료'
s._element.set('show', '0')
prs.save(out)
print('saved', out)
