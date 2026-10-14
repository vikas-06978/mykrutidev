"""
The spreadsheet fixtures for src/lib/sheetConvert.test.js, written by a real
spreadsheet library (openpyxl) rather than by hand:

    pip install openpyxl
    python3 scripts/make-xlsx-fixtures.py

kruti-test-libreoffice.xlsx is kruti-test.xlsx opened and saved again by
LibreOffice Calc, a second writer with its own habits:

    soffice --headless --convert-to xlsx:"Calc MS Excel 2007 XML" --outdir out src/lib/__fixtures__/kruti-test.xlsx
"""
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.cell.rich_text import CellRichText, TextBlock
from openpyxl.cell.text import InlineFont
from openpyxl.comments import Comment
wb = Workbook(); ws = wb.active; ws.title = 'Data'
K = Font(name='Kruti Dev 010', size=14, bold=True)
ws['A1'] = 'Name'; ws['B1'] = 'uke'; ws['B1'].font = K
ws['A2'] = 'Ram Kumar'; ws['B2'] = 'jke dqekj'; ws['B2'].font = Font(name='Kruti Dev 010', size=14)
ws['A3'] = 'jke dqekj'  # same text in Arial: must stay
ws['B3'] = 12345; ws['B3'].font = K
ws['C1'] = '=B3*2'
ws['B4'] = CellRichText(['Total: ', TextBlock(InlineFont(rFont='Kruti Dev 010', sz=12), 'dqy ;ksx'), TextBlock(InlineFont(rFont='Kruti Dev 010', sz=12, b=True), ' fnYyh')])
ws['B5'] = 'fd'; ws['B5'].font = Font(name='DevLys 010')
ws['B6'] = 'iqLrd'; ws['B6'].font = K
ws['B6'].comment = Comment('note', 'me')
ws2 = wb.create_sheet('Second'); ws2['A1'] = 'jke dqekj'; ws2['A1'].font = Font(name='Kruti Dev 010')
wb.save('src/lib/__fixtures__/kruti-test.xlsx')

wb = Workbook(); ws = wb.active
ws['A1'] = 'नाम'; ws['A1'].font = Font(name='Mangal', size=12, color='FF0000')
ws['A2'] = 'राम कुमार'; ws['B2'] = 'PAN: ABCDE1234F, पता दिल्ली'
ws['A3'] = 'English only'; ws['A4'] = 2024
ws['C2'] = 'राम कुमार'; ws['C2'].font = Font(name='Arial', size=10, italic=True)
wb.save('src/lib/__fixtures__/unicode-test.xlsx')
