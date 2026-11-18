"""Two-page printable journal and original worked example; no personal data."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.platypus import Table, TableStyle, Paragraph
from reportlab.lib.styles import ParagraphStyle

root = Path(__file__).resolve().parent.parent
output = root / 'blog' / 'journal-consommation-alcool.pdf'
ink, teal, muted = map(HexColor, ['#183a3c', '#087681', '#576b69'])
line, pale = map(HexColor, ['#cbd9ce', '#edf3e9'])
w, h = A4
x, right = 42, w - 42
c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1, invariant=1)
c.setTitle("Journal de consommation d'alcool - Sobrizen")
c.setAuthor('Rédaction Sobrizen')
c.setSubject('Une semaine à remplir et une page de méthode avec exemple fictif')
body = ParagraphStyle('body', fontName='Helvetica', fontSize=10, leading=15, textColor=ink)
small = ParagraphStyle('small', parent=body, fontSize=9, leading=13)
bold = ParagraphStyle('bold', parent=small, fontName='Helvetica-Bold')

def text(value, y, size=10, color=ink, strong=False, left=x):
    c.setFillColor(color)
    c.setFont('Helvetica-Bold' if strong else 'Helvetica', size)
    c.drawString(left, y, value)

def paragraph(value, y, style=body, width=None):
    p = Paragraph(value, style)
    _, height = p.wrap(width or right-x, h)
    p.drawOn(c, x, y-height)
    return y-height

def header(subtitle):
    c.drawImage(str(root / 'blog' / 'logo-sobrizen.png'), x, h-92, 60, 60, mask='auto')
    text('MON JOURNAL', h-52, 12, teal, True, x+78)
    text("DE CONSOMMATION D'ALCOOL", h-72, 12, ink, True, x+78)
    c.setStrokeColor(line)
    c.line(x, h-108, right, h-108)
    text(subtitle, h-137, 18, ink, True)

def footer(page):
    c.setStrokeColor(line)
    c.line(x, 103, right, 103)
    paragraph('Outil d’observation, sans diagnostic ni protocole de sevrage. Consommation importante ou quotidienne, signes de manque : demande un avis médical avant un arrêt brutal ou une forte réduction. Urgence médicale : 15 ou 112.', 91, small)
    text('www.sobrizen.com/blog/journal-consommation-alcool-pdf', 32, 8, teal)
    c.linkURL('https://www.sobrizen.com/blog/journal-consommation-alcool-pdf', (x, 28, right, 43), relative=0)
    text(f'{page} / 2', 32, 8, muted, left=right-24)

def table(rows, top, heights):
    cells = [[Paragraph(str(value), bold if i == 0 else small) for value in row] for i, row in enumerate(rows)]
    t = Table(cells, colWidths=[51, 163, 70, right-x-284], rowHeights=heights)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), pale),
        ('GRID', (0, 0), (-1, -1), 0.5, line),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
    ]))
    _, height = t.wrap(right-x, h)
    t.drawOn(c, x, top-height)
    return top-height

header('Une semaine, tes observations')
text('Du : ____________________     au : ____________________', h-169, 11)
paragraph('Note les faits connus. <b>0 = aucune consommation ; ? = non renseigné.</b><br/>Une case vide ne signifie pas une journée sans alcool. Ajoute une feuille si nécessaire.', h-188, small)
rows = [['Date', 'Boisson, volume et degré<br/>(ex. 50 cl, 5 %)', 'Verres<br/>standard', 'Contexte / ce que je remarque']]
rows.extend([['____', '', '', ''] for _ in range(7)])
bottom = table(rows, h-231, [50]+[49]*7)
text('Ce que je souhaite retenir ou demander :', bottom-25, 10, strong=True)
c.setStrokeColor(line)
for offset in [47, 69]:
    c.line(x, bottom-offset, right, bottom-offset)
footer(1)
c.showPage()

header('Un exemple pour commencer')
y = paragraph('Exemple entièrement fictif, sans recommandation de consommation. Le journal sert à conserver des informations ; il ne permet pas, à lui seul, d’évaluer un risque individuel.', h-160)
rows = [
    ['Jour', 'Observation', 'Verres<br/>standard', 'Contexte / note'],
    ['Lun.', 'Aucune boisson alcoolisée', '0', 'Repas à la maison'],
    ['Mar.', 'Une bière de 50 cl à 5 %', '2', 'Invitation après le travail'],
    ['Mer.', 'Non renseigné', '?', 'À compléter si je retrouve l’information'],
]
y = table(rows, y-18, [44, 48, 48, 57])-31
text('Quantités : garder le volume et le degré', y, 12, strong=True)
y = paragraph('Un verre standard français correspond à environ 10 g d’alcool pur. Estimation : <b>volume en cl × degré en % × 0,08 = grammes d’alcool pur</b>. Divise ensuite par 10 pour les verres standard. Pour 50 cl à 5 % : 20 g, soit 2 verres standard.', y-15)
y -= 26
text('Trois questions pour relire la semaine', y, 12, strong=True)
y = paragraph('Quelles journées sont renseignées ?<br/>Quelles situations reviennent dans mes notes ?<br/>Quel appui ou quelle question serait utile pour la suite ?', y-15)
y -= 24
text('Une méthode souple', y, 12, strong=True)
y = paragraph('Note ce que tu sais, sans reconstituer les quantités inconnues. Tu peux corriger plus tard, utiliser une ligne supplémentaire ou apporter ton carnet à une consultation. Garde le document dans un lieu privé.', y-15)
y -= 23
y = paragraph('Sources : Ameli, « Faire le point sur ses habitudes » et « Alcool : définition et repères de consommation » ; HAS, rapport sur le repérage précoce. Liens et méthode détaillée sur la page du journal. Consultés le 18 novembre 2026.', y, small)
assert y > 115, 'Method page overlaps footer'
footer(2)
c.showPage()
c.save()
print(f'Created {output.name}: {output.stat().st_size} bytes')
