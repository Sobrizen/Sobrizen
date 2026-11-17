"""One-page reusable printable calendar. No user observations or remote dependencies."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4

root = Path(__file__).resolve().parent.parent
output = root / 'blog' / 'calendrier-sans-alcool-vierge.pdf'
ink, teal, muted = HexColor('#183a3c'), HexColor('#087681'), HexColor('#576b69')
line, pale = HexColor('#cbd9ce'), HexColor('#edf3e9')
c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
c.setTitle('Calendrier sans alcool vierge - Sobrizen')
c.setAuthor('Rédaction Sobrizen')
c.setSubject('Calendrier mensuel de 31 cases, à remplir et à imprimer')
w, h = A4
x, right = 42, w - 42

def text(value, y, size=10, bold=False, color=ink, left=x):
    c.setFillColor(color)
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    c.drawString(left, y, value)

text('SobriZen', h-62, 26, True, teal)
text("MON CALENDRIER D'OBSERVATION", h-96, 11, True)
text('Un mois, tes observations. Sans jugement.', h-118, 11, color=muted)
c.setStrokeColor(line)
c.line(x, h-139, right, h-139)
text('Mois :', h-169, 11, True)
c.line(x+43, h-172, x+280, h-172)
text('Année :', h-169, 11, True, left=x+310)
c.line(x+358, h-172, right, h-172)
text('S = sans alcool     A = avec alcool     ? = non renseigné', h-199, 10, color=muted)
text("Note une lettre par jour. Barre les dates qui n'existent pas dans le mois.", h-216, 9, color=muted)

top = h - 236
gap = 6
cell_w = (right - x - gap*6) / 7
cell_h = 62
for i in range(31):
    row, col = divmod(i, 7)
    bx, by = x + col*(cell_w+gap), top - row*(cell_h+gap) - cell_h
    c.setFillColor(pale if row % 2 == 0 else HexColor('#ffffff'))
    c.setStrokeColor(line)
    c.roundRect(bx, by, cell_w, cell_h, 7, fill=1, stroke=1)
    text(str(i+1), by+cell_h-18, 10, True, left=bx+9)
    c.setStrokeColor(HexColor('#9caf9e'))
    c.line(bx+12, by+17, bx+cell_w-12, by+17)

below = top - 5*(cell_h+gap) - 12
text('Jours renseignés : ______     Dont S : ______     Dont A : ______', below, 10, True)
text("Une case vide ne signifie pas une journée sans alcool.", below-20, 9, color=muted)
text('Ce que je remarque / mon prochain petit pas :', below-52, 11, True)
c.setStrokeColor(line)
for offset in (75, 99):
    c.line(x, below-offset, right, below-offset)

text('Un outil pour observer, sans diagnostic ni protocole de sevrage.', 91, 9, True, muted)
text('Consommation importante ou quotidienne, signes de manque : demande un avis médical', 76, 8, color=muted)
text('avant un arrêt brutal ou une forte réduction. Urgence médicale : 15 ou 112.', 64, 8, color=muted)
text('www.sobrizen.com/blog/calendrier-sans-alcool-a-imprimer', 42, 8, color=teal)
c.linkURL('https://www.sobrizen.com/blog/calendrier-sans-alcool-a-imprimer', (x, 38, right, 53), relative=0)
c.showPage()
c.save()
print(f'Created {output.name}: {output.stat().st_size} bytes')
